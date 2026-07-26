import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import {
  BASE_LIST_COLLECTION,
  normalizeBaseListEntry,
  type NormalizedBaseListEntry,
} from '../utils/baseList';
import { isValidPhoneNumber, normalizePhoneDigits } from '../utils/phoneNumbers';

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

// Minimal RFC4180-ish CSV parser - deliberately duplicated from
// guestRoster.ts's identical parser (rather than shared) to keep this change
// isolated and low-risk instead of touching that already-working file.
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

// Column layout of Gil's per-side sheet tabs (e.g. "צד גיל"): פרטי, משפחה,
// מס' אורחים שהוזמנו, צד, קבוצה, סלולרי - distinct from the "מוזמנים"
// rollup tab guestRoster.ts syncs from, which has no phone column at all.
const COLUMN_FIRST_NAME = 0;
const COLUMN_LAST_NAME = 1;
const COLUMN_GROUP = 4;
const COLUMN_PHONE = 5;

// "צד גיל" tab of the shared master guest spreadsheet - the one tab
// confirmed (as of the conversation with Gil) to have phone numbers filled
// in. Add "צד שלי"'s CSV export URL here too once that tab also has a phone
// column filled in - syncBaseListFromSheet already accepts multiple URLs.
export const DEFAULT_BASE_LIST_SHEET_URLS = [
  'https://docs.google.com/spreadsheets/d/1lICWx8dWFTpnov1edcxBpfuqhhGeUmmBQ-fz-EsWUyk/export?format=csv&gid=752809109',
];

export interface BaseListSyncResult {
  // Guests written to Firestore (had a valid phone number).
  upsertedCount: number;
  // Rows with a name but no usable phone number - can't build a WhatsApp
  // link for these without one, so they're left out rather than guessed at.
  skippedCount: number;
  totalParsed: number;
}

// Pulls phone/name/group from Gil's per-side sheet tab(s) and upserts them
// into baseList, keyed by phone - the browser-based equivalent of running
// scripts/syncBaseList.ts from a terminal, so Gil can do this himself with
// one click instead of needing Node/Admin-SDK credentials.
export async function syncBaseListFromSheet(sheetUrls: string[] = DEFAULT_BASE_LIST_SHEET_URLS): Promise<BaseListSyncResult> {
  const toWrite = new Map<string, { phone: string; name: string; group: string }>();
  let totalParsed = 0;
  let skippedCount = 0;

  for (const sheetUrl of sheetUrls) {
    let response: Response;
    try {
      response = await fetch(sheetUrl);
    } catch {
      throw new Error('לא ניתן היה לגשת לגיליון הטלפונים. ודאו שהוא משותף כ-"כל מי שיש לו את הקישור - צפייה".');
    }

    if (!response.ok) {
      throw new Error(`שגיאה בטעינת גיליון הטלפונים (${response.status} ${response.statusText}).`);
    }

    const csvText = await response.text();
    const rows = parseCsv(csvText);

    for (const row of rows) {
      const firstName = (row[COLUMN_FIRST_NAME] ?? '').trim();
      const lastName = (row[COLUMN_LAST_NAME] ?? '').trim();
      if (!firstName && !lastName) {
        continue; // header row or blank line
      }

      totalParsed += 1;

      const phone = normalizePhoneDigits(row[COLUMN_PHONE] ?? '');
      if (!phone) {
        skippedCount += 1;
        continue;
      }

      const group = (row[COLUMN_GROUP] ?? '').trim();
      const name = `${firstName} ${lastName}`.trim();
      toWrite.set(phone, { phone, name, group });
    }
  }

  const entries = Array.from(toWrite.values());
  const MAX_BATCH_WRITES = 450;
  for (let i = 0; i < entries.length; i += MAX_BATCH_WRITES) {
    const chunk = entries.slice(i, i + MAX_BATCH_WRITES);
    const batch = writeBatch(db);
    for (const entry of chunk) {
      batch.set(doc(db, BASE_LIST_COLLECTION, entry.phone), entry, { merge: true });
    }
    await batch.commit();
  }

  return { upsertedCount: entries.length, skippedCount, totalParsed };
}

// Fixes a baseList entry's name/group directly from the dashboard - the
// phone-list sheet sync (syncBaseListFromSheet above) is the only other way
// this collection ever gets written, and it always re-pulls whatever the
// SOURCE SHEET says. Gil deliberately only ever edits guest info in the
// dashboard (never the underlying Google Sheets), so a stale/misspelled name
// that only ever existed in the phone-list sheet - and was later corrected
// in the guest roster instead - would otherwise never be fixable, silently
// keeping the WhatsApp reminders tab out of sync with the roster forever
// (this is exactly what happened with a guest whose roster name was
// corrected but whose baseList name, from the phone sheet, never was).
// Deliberately keyed by phone (the doc id) - phone itself isn't editable
// here since changing it would mean writing to a different document.
export async function updateBaseListEntry(phone: string, name: string, group: string): Promise<void> {
  await setDoc(doc(db, BASE_LIST_COLLECTION, phone), { phone, name: name.trim(), group: group.trim() }, { merge: true });
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
