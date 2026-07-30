import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';

initializeApp();

const NOTIFICATION_TOKENS_COLLECTION = 'adminNotificationTokens';

interface RsvpData {
  fullName?: string;
  isAttending?: boolean;
  guestsCount?: number;
}

function buildNotification(before: RsvpData | undefined, after: RsvpData | undefined): { title: string; body: string } {
  const isNew = !before && !!after;
  const name = after?.fullName || 'אורח/ת';
  const attending = after?.isAttending;
  const count = after?.guestsCount;

  const statusText = attending === false ? 'לא מגיע/ה' : `מגיע/ה${count ? ` (${count} אורחים)` : ''}`;
  const title = isNew ? 'אישור הגעה חדש' : 'אישור הגעה עודכן';
  const body = `${name} - ${statusText}`;

  return { title, body };
}

// Fires on every create/update/delete under rsvps/{rsvpId} - covers both a
// brand-new guest submission and a guest (or Gil, from the dashboard) later
// editing an existing one. Skips pure deletes (nothing useful to notify
// about) and no-op writes where nothing guest-facing actually changed, so an
// admin-only field like `group` or `manualRosterEntryIds` being set from the
// dashboard doesn't also ping Gil's phone.
export const notifyOnRsvpWrite = onDocumentWritten('rsvps/{rsvpId}', async (event) => {
  const beforeData = event.data?.before.exists ? (event.data.before.data() as RsvpData) : undefined;
  const afterData = event.data?.after.exists ? (event.data.after.data() as RsvpData) : undefined;

  if (!afterData) {
    // Deleted - nothing to notify about.
    return;
  }

  const guestFacingChanged =
    !beforeData ||
    beforeData.fullName !== afterData.fullName ||
    beforeData.isAttending !== afterData.isAttending ||
    beforeData.guestsCount !== afterData.guestsCount;

  if (!guestFacingChanged) {
    return;
  }

  const db = getFirestore();
  const tokensSnapshot = await db.collection(NOTIFICATION_TOKENS_COLLECTION).get();

  if (tokensSnapshot.empty) {
    logger.info('No registered devices for push notifications - skipping.');
    return;
  }

  const tokens = tokensSnapshot.docs.map((tokenDoc) => tokenDoc.data().token as string).filter(Boolean);
  const { title, body } = buildNotification(beforeData, afterData);

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { url: '/he/admin/dashboard' },
  });

  // A token stops working when the guest... well, when Gil's own device
  // uninstalls the PWA, revokes notification permission, or the token
  // otherwise expires. FCM reports this per-token instead of failing the
  // whole batch, so clean up just the dead ones rather than leaving them to
  // silently fail forever.
  const staleDocRefs = response.responses
    .map((result, index) => (!result.success && isTokenInvalid(result.error?.code) ? tokensSnapshot.docs[index].ref : null))
    .filter((ref): ref is FirebaseFirestore.DocumentReference => ref !== null);

  if (staleDocRefs.length > 0) {
    await Promise.all(staleDocRefs.map((ref) => ref.delete()));
    logger.info(`Removed ${staleDocRefs.length} stale notification token(s).`);
  }
});

function isTokenInvalid(errorCode: string | undefined): boolean {
  return errorCode === 'messaging/registration-token-not-registered' || errorCode === 'messaging/invalid-registration-token';
}
