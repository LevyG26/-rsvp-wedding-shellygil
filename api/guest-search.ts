// Vercel serverless function (see api/notify-rsvp.ts for the general
// pattern this follows) - lets the public-facing RSVP form's name field
// (src/components/RSVPForm.tsx) offer live suggestions from the real guest
// roster as someone types, instead of a plain free-text box. Runs
// server-side via the Admin SDK specifically because `guestRoster` is
// admin-only to `list` in firestore.rules (see services/guestRoster.ts's own
// doc comment) - a guest's browser is never authenticated as an admin, so it
// could never read this collection directly, and this endpoint deliberately
// never widens that rule. It only ever returns a name + id per match, never
// side/category/counts/response status.
//
// IMPORTANT (quota-crisis prevention): this project already had a real
// Firestore quota outage once (see the seating/roster tabs' history). A
// naive version of this endpoint - reading the whole guestRoster collection
// on every request - would multiply badly under real guest traffic (every
// keystroke, from every guest, on the page everyone opens). The roster is
// cached in this module's own memory for a short TTL, so within that window
// every request across every guest is served from memory with ZERO
// additional Firestore reads; only the first request after the cache goes
// stale re-reads the collection once. Combined with the client's own
// debounce (RSVPForm.tsx only calls this after the guest pauses typing),
// this keeps total reads bounded no matter how many people are searching.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const GUEST_ROSTER_COLLECTION = 'guestRoster';
const CACHE_TTL_MS = 60_000;
const MAX_RESULTS = 8;

interface ApiRequest {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

interface CachedGuest {
  id: string;
  fullName: string;
  // Precomputed once per cache refresh (not per request) - normalizing on
  // every search would repeat the same string work for every keystroke from
  // every guest instead of once per minute.
  normalized: string;
}

// Module-level (survives across invocations on the same warm Vercel
// instance, reset on a cold start) - exactly the same "cache in memory
// between requests" pattern as any long-lived server process, just scoped
// to however long this particular instance stays warm.
let cachedGuests: CachedGuest[] | null = null;
let cachedAt = 0;

function getAdminApp() {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawServiceAccount) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable.');
  }

  const serviceAccount = JSON.parse(rawServiceAccount);
  return initializeApp({ credential: cert(serviceAccount) });
}

// Same normalization spirit as src/services/rsvpRosterLink.ts's
// normalizeNameToken (accents/niqqud/punctuation-insensitive, lowercase) -
// deliberately a separate, simpler copy here rather than sharing that
// module, since this file runs in Vercel's server environment (not bundled
// with the browser app) and needs to stay a small, independent, low-risk
// unit like api/notify-rsvp.ts already is. This one only needs to be good
// enough for a "does this look like what they're typing" substring search,
// not the full fuzzy-matching precision the actual roster auto-linker uses.
const HEBREW_NIQQUD_PATTERN = new RegExp('[\\u0591-\\u05C7]', 'g');
const LATIN_COMBINING_ACCENT_PATTERN = new RegExp('[\\u0300-\\u036f]', 'g');

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(HEBREW_NIQQUD_PATTERN, '')
    .replace(LATIN_COMBINING_ACCENT_PATTERN, '')
    .replace(/["'׳״.,-]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadGuests(): Promise<CachedGuest[]> {
  const now = Date.now();
  if (cachedGuests && now - cachedAt < CACHE_TTL_MS) {
    return cachedGuests;
  }

  const app = getAdminApp();
  const db = getFirestore(app);
  const snapshot = await db.collection(GUEST_ROSTER_COLLECTION).get();

  const guests: CachedGuest[] = snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data() || {};
    const firstName = typeof data.firstName === 'string' ? data.firstName : '';
    const lastName = typeof data.lastName === 'string' ? data.lastName : '';
    const fullName = `${firstName} ${lastName}`.trim();
    return { id: docSnapshot.id, fullName, normalized: normalize(fullName) };
  }).filter((guest) => guest.fullName.length > 0);

  cachedGuests = guests;
  cachedAt = now;
  return guests;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const rawQuery = req.query?.q;
    const query = typeof rawQuery === 'string' ? rawQuery : Array.isArray(rawQuery) ? rawQuery[0] ?? '' : '';
    const normalizedQuery = normalize(query);

    // Same floor as the client's own debounce/min-length guard, enforced
    // again here so this endpoint is never useful as a way to page through
    // every guest name by sending single-character queries.
    if (normalizedQuery.length < 2) {
      res.status(200).json({ results: [] });
      return;
    }

    const guests = await loadGuests();
    const queryTokens = normalizedQuery.split(' ').filter(Boolean);
    const results = guests
      .filter((guest) => queryTokens.every((token) => guest.normalized.includes(token)))
      .slice(0, MAX_RESULTS)
      .map((guest) => ({ id: guest.id, fullName: guest.fullName }));

    res.status(200).json({ results });
  } catch (error) {
    console.error('guest-search failed', error);
    res.status(500).json({ error: 'Internal error' });
  }
}
