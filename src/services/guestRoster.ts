import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';

export const GUEST_ROSTER_COLLECTION = 'guestRoster';

export type KnownResponse = 'yes' | 'no' | null;

export interface GuestRosterEntry {
  id: string;
  side: string;
  category: string;
  firstName: string;
  lastName: string;
  invitedCount: number;
  knownResponse: KnownResponse;
  // True when knownResponse/invitedCount currently reflect an automatic
  // RSVP-roster link (see rsvpRosterLink.ts) rather than the guest sheet or
  // a manual dashboard edit. Lets the auto-linker safely revert this entry
  // back to "not yet responded" if the RSVP that produced the link is later
  // deleted, without ever touching entries set by sheet sync or by hand.
  linkedFromRsvp: boolean;
  // invitedCount from just before an RSVP auto-link last overwrote it, so a
  // later revert (see above) restores the original planned count instead of
  // leaving behind whatever headcount the now-deleted RSVP had reported.
  preLinkInvitedCount: number | null;
}

export interface GuestRosterEntryInput {
  side: string;
  category: string;
  firstName: string;
  lastName: string;
  invitedCount: number;
  knownResponse: KnownResponse;
  // Optional - omitted by every write site except the RSVP auto-linker,
  // which is the only one that needs to set these. Defaults below keep all
  // other writes (manual edits, sheet sync, old-site import) marking the
  // entry as NOT auto-linked, which is the correct, conservative default.
  linkedFromRsvp?: boolean;
  preLinkInvitedCount?: number | null;
}

function normalizeEntry(id: string, data: Record<string, unknown>): GuestRosterEntry {
  const invitedCountValue = data.invitedCount;
  const knownResponseValue = data.knownResponse;
  const preLinkInvitedCountValue = data.preLinkInvitedCount;

  return {
    id,
    side: typeof data.side === 'string' ? data.side : '',
    category: typeof data.category === 'string' ? data.category : '',
    firstName: typeof data.firstName === 'string' ? data.firstName : '',
    lastName: typeof data.lastName === 'string' ? data.lastName : '',
    invitedCount: typeof invitedCountValue === 'number' && Number.isFinite(invitedCountValue) ? invitedCountValue : 0,
    knownResponse: knownResponseValue === 'yes' || knownResponseValue === 'no' ? knownResponseValue : null,
    linkedFromRsvp: data.linkedFromRsvp === true,
    preLinkInvitedCount:
      typeof preLinkInvitedCountValue === 'number' && Number.isFinite(preLinkInvitedCountValue) ? preLinkInvitedCountValue : null,
  };
}

export async function loadGuestRoster(): Promise<GuestRosterEntry[]> {
  const snapshot = await getDocs(collection(db, GUEST_ROSTER_COLLECTION));
  return snapshot.docs.map((docSnapshot) => normalizeEntry(docSnapshot.id, docSnapshot.data() as Record<string, unknown>));
}

// Live version of loadGuestRoster - keeps the dashboard's roster state
// current on its own (new sheet syncs, edits from another tab/device, etc.)
// without needing a manual refresh. Returns an unsubscribe function.
export function subscribeToGuestRoster(
  onChange: (entries: GuestRosterEntry[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db, GUEST_ROSTER_COLLECTION),
    (snapshot) => {
      onChange(snapshot.docs.map((docSnapshot) => normalizeEntry(docSnapshot.id, docSnapshot.data() as Record<string, unknown>)));
    },
    (error) => {
      console.error('Guest roster live listener failed', error);
      onError?.(error);
    },
  );
}

// Same hashing formula as scripts/importGuestRoster.ts, so entries created
// here and entries imported from the sheet resolve to the same document ID
// (and therefore never collide/duplicate). Uses Web Crypto's SHA-256 since
// MD5 is not available in browsers.
export async function makeGuestRosterId(side: string, category: string, firstName: string, lastName: string): Promise<string> {
  const key = `${side}|${category}|${firstName}|${lastName}`.trim().toLowerCase();
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function toEntryDocData(input: GuestRosterEntryInput) {
  return {
    side: input.side.trim(),
    category: input.category.trim(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    invitedCount: input.invitedCount,
    knownResponse: input.knownResponse,
    linkedFromRsvp: input.linkedFromRsvp ?? false,
    preLinkInvitedCount: input.preLinkInvitedCount ?? null,
    updatedAt: serverTimestamp(),
  };
}

// Adds a brand-new guest to the roster. The ID is derived from the guest's
// details, matching the sheet-import scheme, so a manually added guest that
// later also appears in the sheet won't create a duplicate row.
export async function createGuestRosterEntry(input: GuestRosterEntryInput): Promise<GuestRosterEntry> {
  const id = await makeGuestRosterId(input.side, input.category, input.firstName, input.lastName);
  await setDoc(doc(db, GUEST_ROSTER_COLLECTION, id), toEntryDocData(input));
  return { id, ...input };
}

// Updates an existing roster entry in place (status, invited count, etc).
// Keeps the same document ID even if the name/side/category is edited.
export async function updateGuestRosterEntry(id: string, input: GuestRosterEntryInput): Promise<void> {
  await setDoc(doc(db, GUEST_ROSTER_COLLECTION, id), toEntryDocData(input));
}

export async function deleteGuestRosterEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, GUEST_ROSTER_COLLECTION, id));
}

// Deletes every roster entry for one side (e.g. after a category rename in
// the sheet left stale duplicate rows behind, since each entry's ID is a
// hash of side+category+firstName+lastName - renaming a category orphans
// the old row instead of updating it). Meant to be followed immediately by
// syncGuestRosterFromSheet to rebuild that side fresh from the sheet.
export async function deleteGuestRosterEntriesForSide(entries: GuestRosterEntry[], side: string): Promise<number> {
  const toDelete = entries.filter((entry) => entry.side === side);
  const MAX_BATCH_WRITES = 450;
  for (let i = 0; i < toDelete.length; i += MAX_BATCH_WRITES) {
    const chunk = toDelete.slice(i, i + MAX_BATCH_WRITES);
    const batch = writeBatch(db);
    for (const entry of chunk) {
      batch.delete(doc(db, GUEST_ROSTER_COLLECTION, entry.id));
    }
    await batch.commit();
  }
  return toDelete.length;
}

// Minimal RFC4180-ish CSV parser mirroring scripts/importGuestRoster.ts.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

const COLUMN_SIDE = 0;
const COLUMN_CATEGORY = 1;
const COLUMN_FIRST_NAME = 2;
const COLUMN_LAST_NAME = 3;
const COLUMN_INVITED_COUNT = 4;
const COLUMN_RESPONSE = 5;

const KNOWN_SIDES = new Set(['שלי', 'גיל']);
const YES_VALUES = new Set(['כן']);
const NO_VALUES = new Set(['לא']);

function normalizeResponse(value: string): KnownResponse {
  const trimmed = value.trim();
  if (YES_VALUES.has(trimmed)) return 'yes';
  if (NO_VALUES.has(trimmed)) return 'no';
  return null;
}

// Points at the "מוזמנים" (rollup) tab specifically - gid taken from the
// sheet URL Gil shared, since the plain export URL with no gid defaults to
// whichever tab Google considers first, which isn't necessarily this one.
export const DEFAULT_GUEST_SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1lICWx8dWFTpnov1edcxBpfuqhhGeUmmBQ-fz-EsWUyk/export?format=csv&gid=1711045836';

export interface GuestRosterSyncResult {
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  totalParsed: number;
}

// Pulls the master guest sheet, adds any guest that isn't already in the
// roster yet, and brings existing entries up to date with whatever the sheet
// currently says - but only for fields the sheet actually specifies. A blank
// response or count cell never erases data the roster already has (from a
// manual dashboard edit or an RSVP auto-link), so re-running this is safe
// even while only part of the sheet (e.g. one side) is filled in.
export async function syncGuestRosterFromSheet(existingEntries: GuestRosterEntry[], sheetUrl: string = DEFAULT_GUEST_SHEET_CSV_URL): Promise<GuestRosterSyncResult> {
  let response: Response;
  try {
    response = await fetch(sheetUrl);
  } catch {
    throw new Error('Could not reach the guest sheet. Check your connection or that the sheet is shared as "Anyone with the link - Viewer".');
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch the guest sheet (${response.status} ${response.statusText}).`);
  }

  const csvText = await response.text();
  const rows = parseCsv(csvText);
  const existingById = new Map(existingEntries.map((entry) => [entry.id, entry]));

  const toCreate: { id: string; data: GuestRosterEntryInput }[] = [];
  const toUpdate: { id: string; data: GuestRosterEntryInput }[] = [];
  let totalParsed = 0;

  for (const row of rows) {
    const side = (row[COLUMN_SIDE] ?? '').trim();
    if (!KNOWN_SIDES.has(side)) {
      continue;
    }

    const category = (row[COLUMN_CATEGORY] ?? '').trim();
    const firstName = (row[COLUMN_FIRST_NAME] ?? '').trim();
    const lastName = (row[COLUMN_LAST_NAME] ?? '').trim();

    if (!firstName && !lastName) {
      continue;
    }

    totalParsed += 1;

    const rawCount = (row[COLUMN_INVITED_COUNT] ?? '').trim();
    const parsedCount = Number.parseInt(rawCount, 10);
    const hasExplicitCount = rawCount !== '' && Number.isFinite(parsedCount) && parsedCount > 0;
    const invitedCount = hasExplicitCount ? parsedCount : 1;
    const knownResponse = normalizeResponse(row[COLUMN_RESPONSE] ?? '');
    const id = await makeGuestRosterId(side, category, firstName, lastName);

    const existing = existingById.get(id);
    if (!existing) {
      toCreate.push({ id, data: { side, category, firstName, lastName, invitedCount, knownResponse } });
      continue;
    }

    const nextKnownResponse = knownResponse !== null ? knownResponse : existing.knownResponse;
    const nextInvitedCount = hasExplicitCount ? invitedCount : existing.invitedCount;

    if (nextKnownResponse !== existing.knownResponse || nextInvitedCount !== existing.invitedCount) {
      toUpdate.push({
        id,
        data: {
          side: existing.side,
          category: existing.category,
          firstName: existing.firstName,
          lastName: existing.lastName,
          invitedCount: nextInvitedCount,
          knownResponse: nextKnownResponse,
        },
      });
    }
  }

  const allWrites = [...toCreate, ...toUpdate];
  const MAX_BATCH_WRITES = 450;
  for (let i = 0; i < allWrites.length; i += MAX_BATCH_WRITES) {
    const chunk = allWrites.slice(i, i + MAX_BATCH_WRITES);
    const batch = writeBatch(db);
    for (const item of chunk) {
      batch.set(doc(db, GUEST_ROSTER_COLLECTION, item.id), toEntryDocData(item.data));
    }
    await batch.commit();
  }

  return {
    addedCount: toCreate.length,
    updatedCount: toUpdate.length,
    skippedCount: totalParsed - toCreate.length - toUpdate.length,
    totalParsed,
  };
}
