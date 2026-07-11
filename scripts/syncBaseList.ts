import { config as loadEnv } from 'dotenv';

// Explicitly load .env.local (dotenv's default only loads .env).
loadEnv({ path: '.env.local' });
import { applicationDefault, cert, getApps, initializeApp, type AppOptions } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BASE_LIST_COLLECTION, normalizeBaseListEntry, type NormalizedBaseListEntry } from '../src/utils/baseList';
import { normalizePhoneDigits } from '../src/utils/phoneNumbers';

const INVITE_LINK_VISITS_COLLECTION = 'inviteLinkVisits';
const DEFAULT_BASE_LIST_PATH = path.resolve(process.cwd(), 'baseList.json');
const MAX_BATCH_WRITES = 450;

interface FirebaseConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

interface SyncOptions {
  baseListPath: string;
  write: boolean;
}

interface NormalizedBaseList {
  entries: NormalizedBaseListEntry[];
  skippedCount: number;
}

interface BackfillResult {
  matchedCount: number;
  skippedInvalidPhoneCount: number;
}

function parseOptions(args: string[]): SyncOptions {
  const options: SyncOptions = {
    baseListPath: DEFAULT_BASE_LIST_PATH,
    write: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--write') {
      options.write = true;
      continue;
    }

    if (arg === '--base-list') {
      const nextValue = args[index + 1];
      if (!nextValue) {
        throw new Error('Missing value after --base-list.');
      }

      options.baseListPath = path.resolve(process.cwd(), nextValue);
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

function printUsage(): void {
  console.log([
    'Usage:',
    '  npm run sync:base-list',
    '  npm run sync:base-list -- --write',
    '  npm run sync:base-list -- --base-list path/to/baseList.json --write',
    '',
    'Credentials for --write:',
    '  Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file,',
    '  or set FIREBASE_SERVICE_ACCOUNT_JSON to the JSON content.',
  ].join('\n'));
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function readFirebaseConfig(): FirebaseConfig {
  // Sensitive Firebase project identifiers stay in .env.local, not committed JSON files.
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || process.env.VITE_FIRESTORE_DATABASE_ID;

  if (!projectId) {
    throw new Error('Set FIREBASE_PROJECT_ID in .env.local before writing to Firebase.');
  }

  return {
    projectId,
    firestoreDatabaseId,
  };
}

function readBaseList(baseListPath: string): NormalizedBaseList {
  const rawBaseList = readJsonFile<unknown>(baseListPath);
  if (!Array.isArray(rawBaseList)) {
    throw new Error('baseList.json must contain an array.');
  }

  const entries: NormalizedBaseListEntry[] = [];
  let skippedCount = 0;

  rawBaseList.forEach((rawEntry) => {
    const entry = normalizeBaseListEntry(rawEntry);
    if (!entry) {
      skippedCount += 1;
      return;
    }

    entries.push(entry);
  });

  assertUniquePhones(entries);

  return {
    entries,
    skippedCount,
  };
}

function assertUniquePhones(entries: NormalizedBaseListEntry[]): void {
  const countsByPhone = new Map<string, number>();

  entries.forEach((entry) => {
    countsByPhone.set(entry.phone, (countsByPhone.get(entry.phone) ?? 0) + 1);
  });

  const duplicatePhones = Array.from(countsByPhone)
    .filter(([, count]) => count > 1)
    .map(([phone]) => phone);

  if (duplicatePhones.length > 0) {
    throw new Error(`Duplicate normalized phone numbers in base list: ${duplicatePhones.join(', ')}`);
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
  const firebaseConfig = readFirebaseConfig();
  const app = getApps()[0] ?? initializeApp({
    credential: getAdminCredential(),
    projectId: firebaseConfig.projectId,
  });

  if (firebaseConfig.firestoreDatabaseId) {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }

  return getFirestore(app);
}

async function commitBatchIfNeeded(batch: WriteBatch, writeCount: number): Promise<void> {
  if (writeCount > 0) {
    await batch.commit();
  }
}

async function seedBaseList(db: Firestore, entries: NormalizedBaseListEntry[]): Promise<number> {
  let batch = db.batch();
  let batchWriteCount = 0;
  let totalWriteCount = 0;

  for (const entry of entries) {
    batch.set(
      db.collection(BASE_LIST_COLLECTION).doc(entry.phone),
      {
        phone: entry.phone,
        name: entry.name,
        group: entry.group,
      },
      { merge: true },
    );

    batchWriteCount += 1;
    totalWriteCount += 1;

    if (batchWriteCount >= MAX_BATCH_WRITES) {
      await batch.commit();
      batch = db.batch();
      batchWriteCount = 0;
    }
  }

  await commitBatchIfNeeded(batch, batchWriteCount);
  return totalWriteCount;
}

async function backfillInviteLinkVisits(
  db: Firestore,
  entries: NormalizedBaseListEntry[],
): Promise<BackfillResult> {
  const entriesByPhone = new Map(entries.map((entry) => [entry.phone, entry]));
  const snapshot = await db.collection(INVITE_LINK_VISITS_COLLECTION).get();
  let batch = db.batch();
  let batchWriteCount = 0;
  let matchedCount = 0;
  let skippedInvalidPhoneCount = 0;

  for (const visitDoc of snapshot.docs) {
    const data = visitDoc.data();
    const phone = normalizePhoneDigits(typeof data.phone === 'string' ? data.phone : visitDoc.id);

    if (!phone) {
      skippedInvalidPhoneCount += 1;
      continue;
    }

    const baseListEntry = entriesByPhone.get(phone);
    if (!baseListEntry) {
      continue;
    }

    const updateData = baseListEntry.group
      ? { guestName: baseListEntry.name, guestGroup: baseListEntry.group }
      : { guestName: baseListEntry.name, guestGroup: FieldValue.delete() };

    batch.update(visitDoc.ref, updateData);
    batchWriteCount += 1;
    matchedCount += 1;

    if (batchWriteCount >= MAX_BATCH_WRITES) {
      await batch.commit();
      batch = db.batch();
      batchWriteCount = 0;
    }
  }

  await commitBatchIfNeeded(batch, batchWriteCount);

  return {
    matchedCount,
    skippedInvalidPhoneCount,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const baseList = readBaseList(options.baseListPath);

  console.log(`Validated ${baseList.entries.length} base-list rows.`);
  console.log(`Skipped ${baseList.skippedCount} rows without a valid phone and name.`);

  if (!options.write) {
    console.log('Validation only. Run with --write to seed Firestore and backfill inviteLinkVisits.');
    return;
  }

  const db = initializeFirestore();
  const seededCount = await seedBaseList(db, baseList.entries);
  const backfillResult = await backfillInviteLinkVisits(db, baseList.entries);

  console.log(`Seeded ${seededCount} ${BASE_LIST_COLLECTION} documents.`);
  console.log(`Backfilled ${backfillResult.matchedCount} ${INVITE_LINK_VISITS_COLLECTION} rows.`);
  console.log(`Skipped ${backfillResult.skippedInvalidPhoneCount} existing visit rows with invalid phones.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
