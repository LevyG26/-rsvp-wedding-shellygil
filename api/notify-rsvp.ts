// Vercel serverless function (runs on Vercel's servers, not in the guest's
// browser) - deliberately NOT a Firebase Cloud Function, because Cloud
// Functions require upgrading the Firebase project to the paid "Blaze" plan,
// which requires putting a credit card on file even for $0 of actual usage.
// This route needs none of that: it's just a normal serverless function,
// included automatically in the exact same `git push` that already deploys
// the rest of the site to Vercel - no separate deploy step, no Firebase
// billing plan, no GitHub secrets.
//
// Called by src/components/RSVPForm.tsx right after a guest's RSVP is
// written to Firestore (both a brand-new submission and an edit to an
// existing one). Re-reads the just-written document itself from Firestore
// (via the Admin SDK, which reads/writes are always allowed regardless of
// the security rules below) rather than trusting whatever the browser sends
// - so the push notification always reflects what's actually saved, not
// arbitrary text a stranger could type into a request body.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const NOTIFICATION_TOKENS_COLLECTION = 'adminNotificationTokens';
const RSVPS_COLLECTION = 'rsvps';

interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

function getAdminApp() {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  // Pasted as one long line into a Vercel environment variable (Project
  // Settings > Environment Variables) - the full contents of the JSON key
  // file downloaded from Firebase Console > Project settings > Service
  // accounts > Generate new private key. Never exposed to the browser -
  // this file only runs server-side on Vercel.
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawServiceAccount) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable.');
  }

  const serviceAccount = JSON.parse(rawServiceAccount);
  return initializeApp({ credential: cert(serviceAccount) });
}

function isTokenInvalid(errorCode: string | undefined): boolean {
  return errorCode === 'messaging/registration-token-not-registered' || errorCode === 'messaging/invalid-registration-token';
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { rsvpId?: unknown; isUpdate?: unknown };
    const rsvpId = typeof body.rsvpId === 'string' ? body.rsvpId : '';
    const isUpdate = body.isUpdate === true;

    if (!rsvpId) {
      res.status(400).json({ error: 'Missing rsvpId' });
      return;
    }

    const app = getAdminApp();
    const db = getFirestore(app);

    const rsvpSnapshot = await db.collection(RSVPS_COLLECTION).doc(rsvpId).get();
    if (!rsvpSnapshot.exists) {
      res.status(404).json({ error: 'RSVP not found' });
      return;
    }
    const rsvp = rsvpSnapshot.data() || {};

    const tokensSnapshot = await db.collection(NOTIFICATION_TOKENS_COLLECTION).get();
    if (tokensSnapshot.empty) {
      res.status(200).json({ sent: 0 });
      return;
    }

    const tokens = tokensSnapshot.docs.map((tokenDoc) => tokenDoc.data().token as string).filter(Boolean);
    const fullName = typeof rsvp.fullName === 'string' && rsvp.fullName ? rsvp.fullName : 'אורח/ת';
    const isAttending = rsvp.isAttending;
    const guestsCount = rsvp.guestsCount;

    const statusText = isAttending === false ? 'לא מגיע/ה' : `מגיע/ה${guestsCount ? ` (${guestsCount} אורחים)` : ''}`;
    const title = isUpdate ? 'אישור הגעה עודכן' : 'אישור הגעה חדש';
    const body2 = `${fullName} - ${statusText}`;

    const response = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: { title, body: body2 },
      data: { url: '/he/admin/dashboard' },
    });

    // Clean up any device tokens FCM reports as dead (uninstalled PWA,
    // revoked permission, expired token) so the list doesn't grow stale.
    const staleRefs = response.responses
      .map((result, index) => (!result.success && isTokenInvalid(result.error?.code) ? tokensSnapshot.docs[index].ref : null))
      .filter((ref): ref is FirebaseFirestore.DocumentReference => ref !== null);

    if (staleRefs.length > 0) {
      await Promise.all(staleRefs.map((ref) => ref.delete()));
    }

    res.status(200).json({ sent: response.successCount });
  } catch (error) {
    console.error('notify-rsvp failed', error);
    res.status(500).json({ error: 'Internal error' });
  }
}
