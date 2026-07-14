import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import {
  BASE_LIST_COLLECTION,
  normalizeBaseListEntry,
  type NormalizedBaseListEntry,
} from '../utils/baseList';
import { isValidPhoneNumber } from '../utils/phoneNumbers';

export interface BaseListGuestSnapshot {
  guestName?: string;
  guestGroup?: string;
}

// Full phone-indexed guest list (name + group per phone number) - this is
// the master list Gil's spreadsheet import populates. Used by the WhatsApp
// reminders tab to build a personalized "click to send" link per guest.
// Requires the admin-only `list` rule on baseList (see firestore.rules).
export async function loadBaseList(): Promise<NormalizedBaseListEntry[]> {
  const snapshot = await getDocs(collection(db, BASE_LIST_COLLECTION));
  const guests: NormalizedBaseListEntry[] = [];
  snapshot.forEach((docSnapshot) => {
    const normalized = normalizeBaseListEntry(docSnapshot.data(), docSnapshot.id);
    if (normalized) {
      guests.push(normalized);
    }
  });
  return guests;
}

export async function getBaseListGuestSnapshot(phone: string): Promise<BaseListGuestSnapshot> {
  if (!isValidPhoneNumber(phone)) {
    return {};
  }

  const snapshot = await getDoc(doc(db, BASE_LIST_COLLECTION, phone));
  if (!snapshot.exists()) {
    return {};
  }

  const guest = normalizeBaseListEntry(snapshot.data(), phone);
  if (!guest || guest.phone !== phone) {
    return {};
  }

  return {
    guestName: guest.name,
    ...(guest.group ? { guestGroup: guest.group } : {}),
  };
}
