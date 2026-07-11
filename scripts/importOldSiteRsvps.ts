import { config as loadEnv } from 'dotenv';

// Explicitly load .env.local (dotenv's default only loads .env).
loadEnv({ path: '.env.local' });
import { applicationDefault, cert, getApps, initializeApp, type AppOptions } from 'firebase-admin/app';
import { getFirestore, type Firestore, type WriteBatch } from 'firebase-admin/firestore';

const GUEST_ROSTER_COLLECTION = 'guestRoster';
const MAX_BATCH_WRITES = 450;

// The RSVP export Gil shared from the site that's live today (not this new
// build) - one combined "full name" column, a French/Hebrew attendance
// status, and a guest count. No side/category info at all.
const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1LesIW4zqmjOgkN2jqYXn2O6RjehnJMXlyHrN2xI4XEY/gviz/tq?tqx=out:csv';

const COLUMN_FULL_NAME = 0;
const COLUMN_STATUS = 1;
const COLUMN_COUNT = 2;

type KnownResponse = 'yes' | 'no' | null;

interface RosterDoc {
  id: string;
  side: string;
  category: string;
  firstName: string;
  lastName: string;
  invitedCount: number;
  knownResponse: KnownResponse;
}

interface OldSiteRow {
  fullName: string;
  status: KnownResponse;
  count: number;
}

interface ImportOptions {
  write: boolean;
  sheetUrl: string;
  side: string;
}

function printUsage(): void {
  console.log([
    'Usage:',
    '  npm run import:old-site-rsvps                    (preview only - no writes)',
    '  npm run import:old-site-rsvps -- --write          (apply matched updates)',
    '  npm run import:old-site-rsvps -- --side שלי --write',
    '',
    'Only ever fills in roster entries that currently have NO known response',
    '(pending). Never overwrites an existing yes/no. Ambiguous names (matching',
    'more than one roster entry) and unmatched names are always left alone and',
    'listed for manual review.',
    '',
    'Credentials for --write: same as sync:guest-roster (GOOGLE_APPLICATION_CREDENTIALS',
    'or FIREBASE_SERVICE_ACCOUNT_JSON in .env.local).',
  ].join('\n'));
}

function parseOptions(args: string[]): ImportOptions {
  const options: ImportOptions = { write: false, sheetUrl: DEFAULT_SHEET_URL, side: 'גיל' };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--write') {
      options.write = true;
      continue;
    }

    if (arg === '--url') {
      const nextValue = args[index + 1];
      if (!nextValue) throw new Error('Missing value after --url.');
      options.sheetUrl = nextValue;
      index += 1;
      continue;
    }

    if (arg === '--side') {
      const nextValue = args[index + 1];
      if (!nextValue) throw new Error('Missing value after --side.');
      options.side = nextValue;
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

// Same minimal RFC4180-ish parser used by the other import script.
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

const YES_VALUES = new Set(['assistera', "יגיע / יגיעו", 'יגיע', 'יגיעו']);
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

// Strips quotes/punctuation and lowercases (Hebrew has no case, this is a
// no-op for it). Good enough to make "Talia & Dan Tayar" line up with a
// roster row split as firstName="Talia & Dan" lastName="Tayar".
function normalizeToken(value: string): string {
  return value
    .replace(/["'׳״.,\-]/g, '')
    .toLowerCase()
    .trim();
}

const STOPWORDS = new Set(['&', 'et']);

function tokenize(value: string): string[] {
  return value
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

// Order-independent: every token of the shorter name must appear among the
// longer name's tokens - mirrors src/services/rsvpRosterLink.ts so matching
// behaves the same way it already does for live RSVP submissions.
function namesMatch(tokensA: string[], tokensB: string[]): boolean {
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  return shorter.every((token) => longer.includes(token));
}

function findRosterMatches(fullName: string, roster: RosterDoc[]): RosterDoc[] {
  const nameTokens = tokenize(fullName);
  if (nameTokens.length === 0) return [];
  return roster.filter((entry) => namesMatch(nameTokens, tokenize(`${entry.firstName} ${entry.lastName}`)));
}

async function fetchOldSiteCsv(sheetUrl: string): Promise<string> {
  const response = await fetch(sheetUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch the old-site RSVP sheet (${response.status} ${response.statusText}). ` +
      'Make sure it is shared as "Anyone with the link - Viewer".',
    );
  }
  return response.text();
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

async function fetchRoster(db: Firestore): Promise<RosterDoc[]> {
  const snapshot = await db.collection(GUEST_ROSTER_COLLECTION).get();
  return snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data() as Record<string, unknown>;
    return {
      id: docSnapshot.id,
      side: typeof data.side === 'string' ? data.side : '',
      category: typeof data.category === 'string' ? data.category : '',
      firstName: typeof data.firstName === 'string' ? data.firstName : '',
      lastName: typeof data.lastName === 'string' ? data.lastName : '',
      invitedCount: typeof data.invitedCount === 'number' ? data.invitedCount : 0,
      knownResponse: data.knownResponse === 'yes' || data.knownResponse === 'no' ? data.knownResponse : null,
    };
  });
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  const csvText = await fetchOldSiteCsv(options.sheetUrl);
  const oldSiteRows = parseOldSiteRows(csvText);
  console.log(`Parsed ${oldSiteRows.length} rows from the old-site RSVP sheet.`);

  const db = initializeFirestore();
  const fullRoster = await fetchRoster(db);
  const roster = fullRoster.filter((entry) => entry.side === options.side);
  console.log(`Matching against ${roster.length} roster entries on side "${options.side}" (out of ${fullRoster.length} total).`);

  const toUpdate: { entry: RosterDoc; status: KnownResponse; count: number; oldSiteName: string }[] = [];
  const unmatched: string[] = [];
  const ambiguous: { fullName: string; matches: RosterDoc[] }[] = [];
  let alreadyAnswered = 0;
  let noStatusInOldSite = 0;

  for (const row of oldSiteRows) {
    const matches = findRosterMatches(row.fullName, roster);

    if (matches.length === 0) {
      unmatched.push(row.fullName);
      continue;
    }

    if (matches.length > 1) {
      ambiguous.push({ fullName: row.fullName, matches });
      continue;
    }

    const entry = matches[0];

    if (entry.knownResponse !== null) {
      // Never overwrite an answer the roster already has - the old site
      // export could be stale, and this script should only ever fill gaps.
      alreadyAnswered += 1;
      continue;
    }

    if (row.status === null) {
      noStatusInOldSite += 1;
      continue;
    }

    toUpdate.push({ entry, status: row.status, count: row.count > 0 ? row.count : entry.invitedCount, oldSiteName: row.fullName });
  }

  console.log('');
  console.log(`Would update: ${toUpdate.length}`);
  console.log(`Already had an answer in the roster (left untouched): ${alreadyAnswered}`);
  console.log(`Matched but the old site had no clear yes/no for them: ${noStatusInOldSite}`);
  console.log(`Ambiguous (matched more than one roster entry - skipped): ${ambiguous.length}`);
  console.log(`Unmatched (no roster entry found on side "${options.side}"): ${unmatched.length}`);

  if (toUpdate.length > 0) {
    console.log('');
    console.log('--- Proposed updates ---');
    for (const item of toUpdate) {
      console.log(`  "${item.oldSiteName}" -> ${item.entry.firstName} ${item.entry.lastName} (${item.entry.category}): ${item.status} / ${item.count}`);
    }
  }

  if (ambiguous.length > 0) {
    console.log('');
    console.log('--- Ambiguous (review manually) ---');
    for (const item of ambiguous) {
      console.log(`  "${item.fullName}" matched: ${item.matches.map((m) => `${m.firstName} ${m.lastName}`).join(', ')}`);
    }
  }

  if (!options.write) {
    console.log('');
    console.log('Preview only. Run with --write to apply the proposed updates above.');
    return;
  }

  let batch: WriteBatch = db.batch();
  let batchCount = 0;

  for (const item of toUpdate) {
    batch.update(db.collection(GUEST_ROSTER_COLLECTION).doc(item.entry.id), {
      knownResponse: item.status,
      invitedCount: item.count,
      updatedAt: new Date(),
    });
    batchCount += 1;

    if (batchCount >= MAX_BATCH_WRITES) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log('');
  console.log(`Wrote ${toUpdate.length} updates to Firestore.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
