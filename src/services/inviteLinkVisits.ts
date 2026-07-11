import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Language } from '../i18n';
import { getBaseListGuestSnapshot } from './baseList';
import { isValidPhoneNumber } from '../utils/phoneNumbers';

interface InviteLinkVisitEnrichmentInput {
  id: string;
  phone: string;
  guestName?: string;
  guestGroup?: string;
}

export interface InviteLinkVisitEnrichmentResult {
  matchedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
}

export async function recordInviteLinkVisit(phone: string, lang: Language): Promise<void> {
  if (!isValidPhoneNumber(phone)) {
    throw new Error('Invalid invite link phone number.');
  }

  let guestSnapshot = {};
  try {
    guestSnapshot = await getBaseListGuestSnapshot(phone);
  } catch (lookupError) {
    console.warn('Failed to look up base-list guest for invite link visit', lookupError);
  }

  await setDoc(doc(db, 'inviteLinkVisits', phone), {
    phone,
    lang,
    openedAt: serverTimestamp(),
    ...guestSnapshot,
  });
}

export async function enrichInviteLinkVisitsWithBaseList(
  visits: InviteLinkVisitEnrichmentInput[],
): Promise<InviteLinkVisitEnrichmentResult> {
  const results = await Promise.allSettled(visits.map(enrichInviteLinkVisitWithBaseList));

  return results.reduce<InviteLinkVisitEnrichmentResult>(
    (summary, result) => {
      if (result.status === 'rejected') {
        console.warn('Failed to enrich invite link visit', result.reason);
        summary.failedCount += 1;
        return summary;
      }

      summary[result.value] += 1;
      return summary;
    },
    {
      matchedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    },
  );
}

async function enrichInviteLinkVisitWithBaseList(
  visit: InviteLinkVisitEnrichmentInput,
): Promise<'matchedCount' | 'updatedCount' | 'skippedCount'> {
  if (!isValidPhoneNumber(visit.phone)) {
    return 'skippedCount';
  }

  const guestSnapshot = await getBaseListGuestSnapshot(visit.phone);
  if (!guestSnapshot.guestName) {
    return 'skippedCount';
  }

  const nextGuestGroup = guestSnapshot.guestGroup ?? '';
  if (visit.guestName === guestSnapshot.guestName && visit.guestGroup === nextGuestGroup) {
    return 'matchedCount';
  }

  await updateDoc(doc(db, 'inviteLinkVisits', visit.id), {
    guestName: guestSnapshot.guestName,
    guestGroup: guestSnapshot.guestGroup ?? deleteField(),
  });

  return 'updatedCount';
}
