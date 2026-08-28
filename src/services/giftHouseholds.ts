import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const GIFT_HOUSEHOLDS_COLLECTION = 'giftHouseholds';

// Links two or more guestRoster entries together as one gift-giving unit for
// the "כספים" tab ONLY - e.g. a couple or family entered as separate roster
// rows, where only one of them ever got a giftEntries doc, making the
// other(s) look like they never gave anything. This is deliberately its own
// tiny collection, never touching guestRoster or giftEntries: those remain
// the only source of truth for names/headcounts/recorded amounts, and stay
// exactly as entered no matter how households are grouped or re-grouped
// later. See GiftsSection.tsx/AdminDashboard.tsx for how this is joined onto
// the roster/gift data purely for display, sorting, and the Excel export.
export interface GiftHousehold {
  id: string;
  // Order matters: the first id is the "primary" - edits to the merged
  // row's amounts are always written to the primary's own giftEntries doc,
  // never split or guessed across members, so there's exactly one place any
  // given amount actually lives.
  memberRosterEntryIds: string[];
}

// Deterministic (sorted, not insertion-order) so linking the exact same set
// of people twice - even in a different order - always resolves to the same
// document instead of silently creating a duplicate grouping.
export function giftHouseholdId(memberRosterEntryIds: string[]): string {
  return [...memberRosterEntryIds].sort().join('__');
}

export async function loadGiftHouseholds(): Promise<GiftHousehold[]> {
  const snapshot = await getDocs(collection(db, GIFT_HOUSEHOLDS_COLLECTION));
  return snapshot.docs.map((docSnapshot) => {
    const raw = docSnapshot.data().memberRosterEntryIds;
    const memberRosterEntryIds = Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : [];
    return { id: docSnapshot.id, memberRosterEntryIds };
  });
}

export async function saveGiftHousehold(memberRosterEntryIds: string[]): Promise<void> {
  const id = giftHouseholdId(memberRosterEntryIds);
  await setDoc(doc(db, GIFT_HOUSEHOLDS_COLLECTION, id), {
    memberRosterEntryIds,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteGiftHousehold(id: string): Promise<void> {
  await deleteDoc(doc(db, GIFT_HOUSEHOLDS_COLLECTION, id));
}
