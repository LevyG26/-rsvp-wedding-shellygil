import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  BASE_LIST_COLLECTION,
  normalizeBaseListEntry,
} from '../utils/baseList';
import { isValidPhoneNumber } from '../utils/phoneNumbers';

export interface BaseListGuestSnapshot {
  guestName?: string;
  guestGroup?: string;
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
