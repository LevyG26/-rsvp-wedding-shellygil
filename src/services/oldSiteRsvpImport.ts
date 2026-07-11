import { type GuestRosterEntry, type KnownResponse, updateGuestRosterEntry } from './guestRoster';
import { findCoupleRosterMatches, findCrossScriptRosterMatches, findRosterMatches } from './rsvpRosterLink';

// The RSVP export from the site that's live today (not this new build) -
// one combined "full name" column, a French/Hebrew attendance status, and a
// guest count. No side/category info at all, so matching happens against
// only the roster entries of whichever side the admin picks.
export const DEFAULT_OLD_SITE_RSVP_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1LesIW4zqmjOgkN2jqYXn2O6RjehnJMXlyHrN2xI4XEY/gviz/tq?tqx=out:csv';

const COLUMN_FULL_NAME = 0;
const COLUMN_STATUS = 1;
const COLUMN_COUNT = 2;

interface OldSiteRow {
  fullName: string;
  status: KnownResponse;
  count: number;
}

export interface OldSiteImportPreviewItem {
  entry: GuestRosterEntry;
  oldSiteName: string;
  status: KnownResponse;
  count: number;
}

export interface OldSiteImportPreview {
  toUpdate: OldSiteImportPreviewItem[];
  ambiguous: { fullName: string; matches: GuestRosterEntry[] }[];
  unmatched: string[];
  alreadyAnsweredCount: number;
  noStatusCount: number;
  // Names that didn't match this side's roster but did match someone on a
  // different side - i.e. they're not missing, they just belong elsewhere,
  // so they're kept separate from `unmatched` (which needs real attention).
  otherSide: { fullName: string; matches: GuestRosterEntry[] }[];
  totalParsed: number;
}

// Same minimal RFC4180-ish CSV parser used by src/services/guestRoster.ts.
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

const YES_VALUES = new Set(['assistera', 'יגיע / יגיעו', 'יגיע', 'יגיעו']);
const NO_VALUES = new Set(["n'assistera pas", 'לא יגיע / לא יגיעו', 'לא יגיע', 'לא יגיעו']);

function normalizeStatus(value: string): KnownResponse {
  const trimmed = value.trim().toLowerCase();
  if (YES_VALUES.has(trimmed)) return 'yes';
  if (NO_VALUES.has(trimmed)) return 'no';
  return null;
}

function parseOldSiteRows(csvText: string): OldSiteRow[] {
  const rows = parseCsv(csvText);
  const results: OldSiteRow[] = [];

  for (const row of rows) {
    const fullName = (row[COLUMN_FULL_NAME] ?? '').trim();
    if (!fullName || fullName === 'Noms et prénoms') continue; // header row

    const status = normalizeStatus(row[COLUMN_STATUS] ?? '');
    const parsedCount = Number.parseInt((row[COLUMN_COUNT] ?? '').trim(), 10);
    const count = Number.isFinite(parsedCount) ? parsedCount : 0;

    results.push({ fullName, status, count });
  }

  return results;
}

// The old-site sheet sometimes lists a whole family under one row with no
// first names at all (e.g. "משפחת קפל"). Falls back to a surname-only match
// against the roster's lastName - only used when the regular name-token
// match found nothing, and only ever returns >1 result (which is treated as
// ambiguous, same as any other multi-match) rather than guessing.
const FAMILY_PREFIX_PATTERN = /^משפחת\s+(.+)$/;

function findFamilySurnameMatches(fullName: string, roster: GuestRosterEntry[]): GuestRosterEntry[] {
  const match = fullName.trim().match(FAMILY_PREFIX_PATTERN);
  if (!match) return [];
  const surname = match[1].trim();
  if (!surname) return [];
  return roster.filter((entry) => entry.lastName.trim() === surname);
}

// Fetches the old-site RSVP sheet and matches every row against the roster
// entries of one side, using the exact same name-matching logic as the live
// RSVP auto-link (src/services/rsvpRosterLink.ts), so behavior is consistent
// across both features. Never proposes overwriting an entry that already has
// a known response - only ever proposes filling in blanks. Read-only: makes
// no writes, so it's always safe to run and re-run.
export async function previewOldSiteRsvpImport(
  entries: GuestRosterEntry[],
  side: string,
  sheetUrl: string = DEFAULT_OLD_SITE_RSVP_CSV_URL,
): Promise<OldSiteImportPreview> {
  let response: Response;
  try {
    response = await fetch(sheetUrl);
  } catch {
    throw new Error('Could not reach the old-site RSVP sheet. Check your connection or that it is shared as "Anyone with the link - Viewer".');
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch the old-site RSVP sheet (${response.status} ${response.statusText}).`);
  }

  const csvText = await response.text();
  const oldSiteRows = parseOldSiteRows(csvText);
  const roster = entries.filter((entry) => entry.side === side);
  const otherSidesRoster = entries.filter((entry) => entry.side !== side);

  const toUpdate: OldSiteImportPreviewItem[] = [];
  const ambiguous: { fullName: string; matches: GuestRosterEntry[] }[] = [];
  const unmatched: string[] = [];
  const otherSide: { fullName: string; matches: GuestRosterEntry[] }[] = [];
  let alreadyAnsweredCount = 0;
  let noStatusCount = 0;

  for (const row of oldSiteRows) {
    let matches = findRosterMatches(row.fullName, roster);
    if (matches.length === 0) {
      matches = findFamilySurnameMatches(row.fullName, roster);
    }

    if (matches.length === 0) {
      // Not found on this side - but if it matches someone on another side
      // (including a Hebrew name matching a Latin-spelled roster entry,
      // e.g. "דוד גולן" / "David Golan"), it's not actually missing, it
      // just belongs elsewhere. Don't clutter the unmatched list with names
      // that are already accounted for there.
      const otherSideMatches = [
        ...findRosterMatches(row.fullName, otherSidesRoster),
        ...findCrossScriptRosterMatches(row.fullName, otherSidesRoster),
        ...findCoupleRosterMatches(row.fullName, otherSidesRoster),
      ];

      if (otherSideMatches.length > 0) {
        otherSide.push({ fullName: row.fullName, matches: otherSideMatches });
      } else {
        unmatched.push(row.fullName);
      }
      continue;
    }

    if (matches.length > 1) {
      ambiguous.push({ fullName: row.fullName, matches });
      continue;
    }

    const entry = matches[0];

    if (entry.knownResponse !== null) {
      alreadyAnsweredCount += 1;
      continue;
    }

    if (row.status === null) {
      noStatusCount += 1;
      continue;
    }

    toUpdate.push({
      entry,
      oldSiteName: row.fullName,
      status: row.status,
      count: row.count > 0 ? row.count : entry.invitedCount,
    });
  }

  return {
    toUpdate,
    ambiguous,
    unmatched,
    alreadyAnsweredCount,
    noStatusCount,
    otherSide,
    totalParsed: oldSiteRows.length,
  };
}

// Applies a previously-shown preview's proposed updates. Meant to be called
// only after the admin has reviewed previewOldSiteRsvpImport's output.
export async function applyOldSiteRsvpImport(items: OldSiteImportPreviewItem[]): Promise<void> {
  for (const item of items) {
    await updateGuestRosterEntry(item.entry.id, {
      side: item.entry.side,
      category: item.entry.category,
      firstName: item.entry.firstName,
      lastName: item.entry.lastName,
      invitedCount: item.count,
      knownResponse: item.status,
    });
  }
}
