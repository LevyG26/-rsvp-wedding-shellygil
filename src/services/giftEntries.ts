import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { isGiftMethod, type GiftMethod } from '../utils/gifts';

const GIFT_ENTRIES_COLLECTION = 'giftEntries';

// Deliberately its own tiny collection, keyed by guestRoster entry id,
// rather than a field on guestRoster itself. guestRoster documents are
// always rewritten in full (see isValidGuestRosterEntry in firestore.rules -
// every write there must supply every field), and get rewritten wholesale by
// several different flows (the sheet sync, the automatic RSVP-roster
// linker). Piggybacking gift data onto that document would mean every one
// of those flows would also need to carry the current gift amount/method
// along just to avoid silently wiping it out on the next sync/auto-link
// pass. A separate collection sidesteps that risk entirely - same reasoning
// as baseList being its own collection instead of a field on guestRoster.
export interface GiftEntry {
  rosterEntryId: string;
  amount: number | null;
  method: GiftMethod | null;
}

export async function loadGiftEntries(): Promise<GiftEntry[]> {
  const snapshot = await getDocs(collection(db, GIFT_ENTRIES_COLLECTION));
  return snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data();
    const amountValue = data.amount;
    return {
      rosterEntryId: docSnapshot.id,
      amount: typeof amountValue === 'number' && Number.isFinite(amountValue) ? amountValue : null,
      method: isGiftMethod(data.method) ? data.method : null,
    };
  });
}

// Both null (the common "cleared everything" case) deletes the doc entirely
// rather than storing an empty/null-filled one - keeps the collection
// containing only guests who actually have something recorded, which is
// also just simpler for isValidGiftEntry in firestore.rules to validate.
export async function saveGiftEntry(rosterEntryId: string, amount: number | null, method: GiftMethod | null): Promise<void> {
  if (amount === null && method === null) {
    await deleteDoc(doc(db, GIFT_ENTRIES_COLLECTION, rosterEntryId));
    return;
  }

  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (amount !== null) payload.amount = amount;
  if (method !== null) payload.method = method;

  // No {merge: true} - a full replace is what we want here, so clearing a
  // field (e.g. amount kept, method cleared) actually removes it from the
  // stored document instead of leaving the old value behind.
  await setDoc(doc(db, GIFT_ENTRIES_COLLECTION, rosterEntryId), payload);
}
