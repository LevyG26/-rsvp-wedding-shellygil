import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  DEFAULT_GIFT_CURRENCY,
  EMPTY_GIFT_AMOUNTS,
  GIFT_METHODS,
  isEmptyGiftAmounts,
  isGiftCurrency,
  type GiftAmounts,
  type GiftMethod,
  type GiftMethodAmount,
} from '../utils/gifts';

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
export interface GiftEntry {
  rosterEntryId: string;
  amounts: GiftAmounts;
}

// Each method is stored as its own pair of fields (e.g. cashAmount +
// cashCurrency) rather than one shared amount/currency - a guest can split
// their gift across more than one method (500 cash + 500 by Bit), and each
// of those can independently be in a different currency.
const METHOD_FIELD_PREFIX: Record<GiftMethod, string> = {
  cash: 'cash',
  bit_paybox: 'bitPaybox',
  check: 'check',
};

function readMethodAmount(data: Record<string, unknown>, method: GiftMethod): GiftMethodAmount {
  const prefix = METHOD_FIELD_PREFIX[method];
  const amountValue = data[`${prefix}Amount`];
  const currencyValue = data[`${prefix}Currency`];
  const amount = typeof amountValue === 'number' && Number.isFinite(amountValue) ? amountValue : null;
  const currency = isGiftCurrency(currencyValue) ? currencyValue : DEFAULT_GIFT_CURRENCY;
  return { amount, currency };
}

export async function loadGiftEntries(): Promise<GiftEntry[]> {
  const snapshot = await getDocs(collection(db, GIFT_ENTRIES_COLLECTION));
  return snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data();
    const amounts = GIFT_METHODS.reduce((accumulated, method) => {
      accumulated[method] = readMethodAmount(data, method);
      return accumulated;
    }, {} as GiftAmounts);
    return { rosterEntryId: docSnapshot.id, amounts };
  });
}

// All three amounts null (nothing recorded, e.g. after clearing every
// field) deletes the doc entirely rather than storing an empty one - keeps
// the collection containing only guests who actually have something
// recorded, which is also simpler for isValidGiftEntry in firestore.rules
// to validate.
export async function saveGiftEntry(rosterEntryId: string, amounts: GiftAmounts): Promise<void> {
  if (isEmptyGiftAmounts(amounts)) {
    await deleteDoc(doc(db, GIFT_ENTRIES_COLLECTION, rosterEntryId));
    return;
  }

  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  GIFT_METHODS.forEach((method) => {
    const entry = amounts[method];
    if (entry.amount !== null) {
      const prefix = METHOD_FIELD_PREFIX[method];
      payload[`${prefix}Amount`] = entry.amount;
      payload[`${prefix}Currency`] = entry.currency;
    }
  });

  // No {merge: true} - a full replace is what we want here, so clearing one
  // field (e.g. cash kept, check cleared) actually removes it from the
  // stored document instead of leaving the old value behind.
  await setDoc(doc(db, GIFT_ENTRIES_COLLECTION, rosterEntryId), payload);
}

export { EMPTY_GIFT_AMOUNTS as EMPTY_AMOUNTS };
