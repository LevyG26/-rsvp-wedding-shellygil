import { config as loadEnv } from 'dotenv';

// Explicitly load .env.local (dotenv's default only loads .env).
loadEnv({ path: '.env.local' });
import { applicationDefault, cert, getApps, initializeApp, type AppOptions } from 'firebase-admin/app';
import { getFirestore, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const GUEST_ROSTER_COLLECTION = 'guestRoster';
const MAX_BATCH_WRITES = 450;

// Default source: the couple's master guest-list Google Sheet, exported as CSV.
// Must be shared as "Anyone with the link - Viewer" (or better) for the fetch to work.
const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1lICWx8dWFTpnov1edcxBpfuqhhGeUmmBQ-fz-EsWUyk/export?format=csv&gid=1711045836';

// Expected column order in the sheet (columns after F are ignored - the sheet
// has an unrelated small totals table in later columns on some rows).
const COLUMN_SIDE = 0;
const COLUMN_CATEGORY = 1;
const COLUMN_FIRST_NAME = 2;
const COLUMN_LAST_NAME = 3;
const COLUMN_INVITED_COUNT = 4;
const COLUMN_RESPONSE = 5;

const KNOWN_SIDES = new Set(['שלי', 'גיל']);
const YES_VALUES = new Set(['כן']);
const NO_VALUES = new Set(['לא']);

type KnownResponse = 'yes' | 'no' | null;

interface RosterEntry {
  id: string;
  side: string;
  category: string;
  firstName: string;
  lastName: string;
  invitedCount: number;
  knownResponse: KnownResponse;
}

interface ImportOptions {
  write: boolean;
  sheetUrl: string;
  csvFile?: string;
  replaceAll: boolean;
}

function printUsage(): void {
  console.log([
    'Usage:',
    '  npm run sync:guest-roster                          (validate/preview only)',
    '  npm run sync:guest-roster -- --write                (add any new guests, never touches existing rows)',
    '  npm run sync:guest-roster -- --url <sheet-csv-url> --write',
    '  npm run sync:guest-roster -- --csv-file path/to/file.csv --write',
    '  npm run sync:guest-roster -- --write --replace-all  (ONE-TIME: wipes guestRoster, then re-imports fresh)',
    '',
    'Credentials for --write:',
    '  Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file,',
    '  or set FIREBASE_SERVICE_ACCOUNT_JSON to the JSON content.',
  ].join('\n'));
}

function parseOptions(args: string[]): ImportOptions {
  const options: ImportOptions = { write: false, sheetUrl: DEFAULT_SHEET_URL, replaceAll: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--write') {
      options.write = true;
      continue;
    }

    if (arg === '--replace-all') {
      options.replaceAll = true;
      continue;
    }

    if (arg === '--url') {
      const nextValue = args[index + 1];
      if (!nextValue) {
        throw new Error('Missing value after --url.');
      }
      options.sheetUrl = nextValue;
      index += 1;
      continue;
    }

    if (arg === '--csv-file') {
      const nextValue = args[index + 1];
      if (!nextValue) {
        throw new Error('Missing value after --csv-file.');
      }
      options.csvFile = nextValue;
      index += 1;
      continue;
    }

    if (arg === '--help') {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

// Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas,
// and doubled-quote escaping (e.g. "סה""כ" -> סה"כ). Good enough for a
// Google Sheets CSV export, without adding a new dependency.
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

function normalizeResponse(value: string): KnownResponse {
  const trimmed = value.trim();
  if (YES_VALUES.has(trimmed)) return 'yes';
  if (NO_VALUES.has(trimmed)) return 'no';
  return null;
}

// SHA-256 (not MD5) so IDs match the browser-side scheme in
// src/services/guestRoster.ts, which uses Web Crypto (no MD5 available there).
function makeId(side: string, category: string, firstName: string, lastName: string): string {
  const key = `${side}|${category}|${firstName}|${lastName}`.trim().toLowerCase();
  return createHash('sha256').update(key).digest('hex');
}

async function fetchCsv(options: ImportOptions): Promise<string> {
  if (options.csvFile) {
    return readFileSync(options.csvFile, 'utf8');
  }

  const response = await fetch(options.sheetUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch sheet CSV (${response.status} ${response.statusText}). ` +
      'Make sure the sheet is shared as "Anyone with the link - Viewer".',
    );
  }
  return response.text();
}

function buildRoster(csvText: string): { entries: RosterEntry[]; skippedCount: number } {
  const rows = parseCsv(csvText);
  const entries: RosterEntry[] = [];
  let skippedCount = 0;

  for (const row of rows) {
    const side = (row[COLUMN_SIDE] ?? '').trim();
    if (!KNOWN_SIDES.has(side)) {
      // Skips the header row, the "Total" row, and the small side-table
      // that lives in unrelated columns of a few rows.
      skippedCount += 1;
      continue;
    }

    const category = (row[COLUMN_CATEGORY] ?? '').trim();
    const firstName = (row[COLUMN_FIRST_NAME] ?? '').trim();
    const lastName = (row[COLUMN_LAST_NAME] ?? '').trim();

    if (!firstName && !lastName) {
      skippedCount += 1;
      continue;
    }

    const parsedCount = Number.parseInt((row[COLUMN_INVITED_COUNT] ?? '').trim(), 10);
    const invitedCount = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1;
    const knownResponse = normalizeResponse(row[COLUMN_RESPONSE] ?? '');

    entries.push({
      id: makeId(side, category, firstName, lastName),
      side,
      category,
      firstName,
      lastName,
      invitedCount,
      knownResponse,
    });
  }

  return { entries, skippedCount };
}

function summarize(entries: RosterEntry[]): void {
  const bySide = new Map<string, { invited: number; yes: number; no: number; pending: number }>();

  for (const entry of entries) {
    const bucket = bySide.get(entry.side) ?? { invited: 0, yes: 0, no: 0, pending: 0 };
    bucket.invited += entry.invitedCount;
    if (entry.knownResponse === 'yes') bucket.yes += entry.invitedCount;
    else if (entry.knownResponse === 'no') bucket.no += entry.invitedCount;
    else bucket.pending += entry.invitedCount;
    bySide.set(entry.side, bucket);
  }

  console.log(`Parsed ${entries.length} roster rows.`);
  for (const [side, bucket] of bySide) {
    console.log(
      `  ${side}: invited=${bucket.invited} confirmed=${bucket.yes} declined=${bucket.no} pending=${bucket.pending}`,
    );
  }
}

function getAdminCredential(): AppOptions['credential'] {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    return applicationDefault();
  }

  try {
    return cert(JSON.parse(serviceAccountJson));
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
}

function initializeFirestore(): Firestore {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || process.env.VITE_FIRESTORE_DATABASE_ID;

  if (!projectId) {
    throw new Error('Set FIREBASE_PROJECT_ID in .env.local before writing to Firebase.');
  }

  const app = getApps()[0] ?? initializeApp({ credential: getAdminCredential(), projectId });
  return firestoreDatabaseId ? getFirestore(app, firestoreDatabaseId) : getFirestore(app);
}

async function deleteAllRosterDocs(db: Firestore): Promise<number> {
  const snapshot = await db.collection(GUEST_ROSTER_COLLECTION).get();
  let batch: WriteBatch = db.batch();
  let batchCount = 0;
  let deletedCount = 0;

  for (const docSnapshot of snapshot.docs) {
    batch.delete(docSnapshot.ref);
    batchCount += 1;
    deletedCount += 1;

    if (batchCount >= MAX_BATCH_WRITES) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return deletedCount;
}

async function fetchExistingRosterIds(db: Firestore): Promise<Set<string>> {
  const snapshot = await db.collection(GUEST_ROSTER_COLLECTION).select().get();
  return new Set(snapshot.docs.map((docSnapshot) => docSnapshot.id));
}

// Only writes guests whose ID isn't already in Firestore. This means running
// the script again after guests have been added/edited/deleted directly in
// the dashboard will never overwrite or resurrect anything - it only adds
// people who are brand new to the sheet.
async function writeRoster(db: Firestore, entries: RosterEntry[], existingIds: Set<string>): Promise<{ writtenCount: number; skippedExistingCount: number }> {
  let batch: WriteBatch = db.batch();
  let batchWriteCount = 0;
  let writtenCount = 0;
  let skippedExistingCount = 0;

  for (const entry of entries) {
    if (existingIds.has(entry.id)) {
      skippedExistingCount += 1;
      continue;
    }

    batch.set(db.collection(GUEST_ROSTER_COLLECTION).doc(entry.id), {
      side: entry.side,
      category: entry.category,
      firstName: entry.firstName,
      lastName: entry.lastName,
      invitedCount: entry.invitedCount,
      knownResponse: entry.knownResponse,
      updatedAt: new Date(),
    });

    batchWriteCount += 1;
    writtenCount += 1;

    if (batchWriteCount >= MAX_BATCH_WRITES) {
      await batch.commit();
      batch = db.batch();
      batchWriteCount = 0;
    }
  }

  if (batchWriteCount > 0) {
    await batch.commit();
  }

  return { writtenCount, skippedExistingCount };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const csvText = await fetchCsv(options);
  const { entries, skippedCount } = buildRoster(csvText);

  summarize(entries);
  console.log(`Skipped ${skippedCount} non-guest rows (headers/totals/blank names).`);

  if (!options.write) {
    console.log('Validation only. Run with --write to seed Firestore.');
    return;
  }

  const db = initializeFirestore();

  if (options.replaceAll) {
    const deletedCount = await deleteAllRosterDocs(db);
    console.log(`--replace-all: deleted ${deletedCount} existing ${GUEST_ROSTER_COLLECTION} documents.`);
  }

  const existingIds = options.replaceAll ? new Set<string>() : await fetchExistingRosterIds(db);
  const { writtenCount, skippedExistingCount } = await writeRoster(db, entries, existingIds);
  console.log(`Wrote ${writtenCount} new ${GUEST_ROSTER_COLLECTION} documents.`);
  console.log(`Skipped ${skippedExistingCount} guests already in the roster (never overwritten).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
