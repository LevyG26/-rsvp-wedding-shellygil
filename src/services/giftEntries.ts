import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { GiftMethod } from '../utils/gifts';

const GIFT_ENTRIES_COLLECTION = 'giftEntries';

// Deliberately its own tiny collection, keyed by guestRoster entry id,
// rather than a field on guestRoster itself. guestRoster documents are
// always rewritten in full (see isValidGuestRosterEntry in firestore.rules -
// every write there must supply every field), and get rewritten wholesale by
// several different flows (the sheet sync, the automatic RSVP-roster
// linker). Piggybacking gift data onto that document would mean every one
// of those flows would also need to carry the current gift amounts along
// just to avoid silently wiping them out on the next sync/auto-link pass. A
// separate collection sidesteps that risk entirely - same reasoning as
// baseList being its own collection instead of a field on guestRoster.
//
// One amount PER METHOD rather than a single amount + a single method - a
// guest can split their gift across more than one (e.g. 500 in cash + 500 by
// Bit), so this has to hold all three independently, not force a single
// pick.
export interface GiftEntry {
  rosterEntryId: string;
  amounts: Record<GiftMethod, number | null>;
}

const EMPTY_AMOUNTS: Record<GiftMethod, number | null> = { cash: null, bit_paybox: null, check: null };

function readAmount(data: Record<string, unknown>, key: string): number | null {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function loadGiftEntries(): Promise<GiftEntry[]> {
  const snapshot = await getDocs(collection(db, GIFT_ENTRIES_COLLECTION));
  return snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data();
    return {
      rosterEntryId: docSnapshot.id,
      amounts: {
        cash: readAmount(data, 'cashAmount'),
        bit_paybox: readAmount(data, 'bitPayboxAmount'),
        check: readAmount(data, 'checkAmount'),
      },
    };
  });
}

// All three null (nothing recorded, e.g. after clearing every field) deletes
// the doc entirely rather than storing an empty one - keeps the collection
// containing only guests who actually have something recorded, which is
// also simpler for isValidGiftEntry in firestore.rules to validate.
export async function saveGiftEntry(rosterEntryId: string, amounts: Record<GiftMethod, number | null>): Promise<void> {
  const isEmpty = amounts.cash === null && amounts.bit_paybox === null && amounts.check === null;
  if (isEmpty) {
    await deleteDoc(doc(db, GIFT_ENTRIES_COLLECTION, rosterEntryId));
    return;
  }

  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (amounts.cash !== null) payload.cashAmount = amounts.cash;
  if (amounts.bit_paybox !== null) payload.bitPayboxAmount = amounts.bit_paybox;
  if (amounts.check !== null) payload.checkAmount = amounts.check;

  // No {merge: true} - a full replace is what we want here, so clearing one
  // field (e.g. cash kept, check cleared) actually removes it from the
  // stored document instead of leaving the old value behind.
  await setDoc(doc(db, GIFT_ENTRIES_COLLECTION, rosterEntryId), payload);
}

export { EMPTY_AMOUNTS };
