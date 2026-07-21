import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

export const SEATING_TABLES_COLLECTION = 'seatingTables';
export const SEATING_GROUPS_COLLECTION = 'seatingGroups';
export const SEATING_ASSIGNMENTS_COLLECTION = 'seatingAssignments';

export type SeatingTableShape = 'round' | 'rect';

// Position/size on the free-form floor-plan canvas Gil drags and resizes by
// hand to match the actual hall layout - kept separate from seatCount, since
// a table's physical footprint on the plan and how many people it seats are
// two different things he wants to control independently.
export interface SeatingTableLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: SeatingTableShape;
}

export const DEFAULT_TABLE_LAYOUT: SeatingTableLayout = { x: 40, y: 40, width: 110, height: 110, shape: 'round' };

export interface SeatingTable extends SeatingTableLayout {
  id: string;
  name: string;
  seatCount: number;
}

// An ad-hoc, named cluster of confirmed guestRoster entry IDs Gil creates on
// the fly (e.g. "חברים של שלי מהצבא") purely to make seating a bunch of
// otherwise-unrelated parties together a one-click action - distinct from the
// side/category fields already on the roster, which are about the invite
// list, not where people sit.
export interface SeatingGroup {
  id: string;
  name: string;
  memberEntryIds: string[];
}

// One row = "N seats belonging to this roster entry sit at this table". A
// single roster entry (e.g. a family of 4) can have more than one of these
// (e.g. 2 at table A, 2 at table B) when Gil deliberately splits a party
// across tables - that's the whole reason this is its own collection instead
// of a single "tableId" field on the roster entry itself. Deterministic ID
// (entryId__tableId) means there's at most one row per entry+table pair, so
// adjusting a party's seat count at a table already assigned to them is a
// plain overwrite instead of a duplicate.
export interface SeatingAssignment {
  id: string;
  rosterEntryId: string;
  tableId: string;
  seatsCount: number;
}

function assignmentId(rosterEntryId: string, tableId: string): string {
  return `${rosterEntryId}__${tableId}`;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID - still matches the
  // Firestore rules' isValidId charset ([a-zA-Z0-9_-]+).
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeTable(id: string, data: Record<string, unknown>): SeatingTable {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    seatCount: numberOr(data.seatCount, 0),
    x: numberOr(data.x, DEFAULT_TABLE_LAYOUT.x),
    y: numberOr(data.y, DEFAULT_TABLE_LAYOUT.y),
    width: numberOr(data.width, DEFAULT_TABLE_LAYOUT.width),
    height: numberOr(data.height, DEFAULT_TABLE_LAYOUT.height),
    shape: data.shape === 'rect' ? 'rect' : 'round',
  };
}

function normalizeGroup(id: string, data: Record<string, unknown>): SeatingGroup {
  const members = data.memberEntryIds;
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    memberEntryIds: Array.isArray(members) ? members.filter((entryId): entryId is string => typeof entryId === 'string') : [],
  };
}

function normalizeAssignment(id: string, data: Record<string, unknown>): SeatingAssignment {
  const seatsCountValue = data.seatsCount;
  return {
    id,
    rosterEntryId: typeof data.rosterEntryId === 'string' ? data.rosterEntryId : '',
    tableId: typeof data.tableId === 'string' ? data.tableId : '',
    seatsCount: typeof seatsCountValue === 'number' && Number.isFinite(seatsCountValue) ? seatsCountValue : 0,
  };
}

export function subscribeToSeatingTables(onChange: (tables: SeatingTable[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    collection(db, SEATING_TABLES_COLLECTION),
    (snapshot) => onChange(snapshot.docs.map((docSnapshot) => normalizeTable(docSnapshot.id, docSnapshot.data() as Record<string, unknown>))),
    (error) => {
      console.error('Seating tables live listener failed', error);
      onError?.(error);
    },
  );
}

export function subscribeToSeatingGroups(onChange: (groups: SeatingGroup[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    collection(db, SEATING_GROUPS_COLLECTION),
    (snapshot) => onChange(snapshot.docs.map((docSnapshot) => normalizeGroup(docSnapshot.id, docSnapshot.data() as Record<string, unknown>))),
    (error) => {
      console.error('Seating groups live listener failed', error);
      onError?.(error);
    },
  );
}

export function subscribeToSeatingAssignments(onChange: (assignments: SeatingAssignment[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    collection(db, SEATING_ASSIGNMENTS_COLLECTION),
    (snapshot) => onChange(snapshot.docs.map((docSnapshot) => normalizeAssignment(docSnapshot.id, docSnapshot.data() as Record<string, unknown>))),
    (error) => {
      console.error('Seating assignments live listener failed', error);
      onError?.(error);
    },
  );
}

export async function createSeatingTable(name: string, seatCount: number, layout: SeatingTableLayout = DEFAULT_TABLE_LAYOUT): Promise<string> {
  const id = makeId();
  await setDoc(doc(db, SEATING_TABLES_COLLECTION, id), {
    name: name.trim(),
    seatCount,
    ...layout,
    updatedAt: serverTimestamp(),
  });
  return id;
}

// Full update (rename / change seat count) - keeps whatever layout is passed
// in, so callers editing just the name/seatCount should pass the table's
// current layout back through unchanged.
export async function updateSeatingTable(id: string, name: string, seatCount: number, layout: SeatingTableLayout): Promise<void> {
  await setDoc(doc(db, SEATING_TABLES_COLLECTION, id), {
    name: name.trim(),
    seatCount,
    ...layout,
    updatedAt: serverTimestamp(),
  });
}

// Lightweight partial update for dragging/resizing on the floor-plan canvas -
// a plain Firestore updateDoc (merge), so this never has to know or resend
// the table's name/seatCount just to move it.
export async function updateSeatingTableLayout(id: string, layout: SeatingTableLayout): Promise<void> {
  await updateDoc(doc(db, SEATING_TABLES_COLLECTION, id), {
    ...layout,
    updatedAt: serverTimestamp(),
  });
}

// Deletes the table and every seating assignment pointing at it in one
// batch, so removing a table always frees its guests back to the unseated
// pool instead of leaving orphaned assignment rows behind.
export async function deleteSeatingTable(id: string, assignments: SeatingAssignment[]): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, SEATING_TABLES_COLLECTION, id));
  assignments.filter((assignment) => assignment.tableId === id).forEach((assignment) => {
    batch.delete(doc(db, SEATING_ASSIGNMENTS_COLLECTION, assignment.id));
  });
  await batch.commit();
}

export async function createSeatingGroup(name: string, memberEntryIds: string[]): Promise<string> {
  const id = makeId();
  await setDoc(doc(db, SEATING_GROUPS_COLLECTION, id), {
    name: name.trim(),
    memberEntryIds,
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function updateSeatingGroup(id: string, name: string, memberEntryIds: string[]): Promise<void> {
  await setDoc(doc(db, SEATING_GROUPS_COLLECTION, id), {
    name: name.trim(),
    memberEntryIds,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSeatingGroup(id: string): Promise<void> {
  await deleteDoc(doc(db, SEATING_GROUPS_COLLECTION, id));
}

// Upserts how many of a roster entry's confirmed seats sit at a given table.
// Setting seatsCount to 0 (or less) removes the assignment entirely instead
// of writing a useless zero row.
export async function setSeatingAssignment(rosterEntryId: string, tableId: string, seatsCount: number): Promise<void> {
  const id = assignmentId(rosterEntryId, tableId);
  if (seatsCount <= 0) {
    await deleteDoc(doc(db, SEATING_ASSIGNMENTS_COLLECTION, id));
    return;
  }
  await setDoc(doc(db, SEATING_ASSIGNMENTS_COLLECTION, id), {
    rosterEntryId,
    tableId,
    seatsCount,
    updatedAt: serverTimestamp(),
  });
}

export async function removeSeatingAssignment(rosterEntryId: string, tableId: string): Promise<void> {
  await deleteDoc(doc(db, SEATING_ASSIGNMENTS_COLLECTION, assignmentId(rosterEntryId, tableId)));
}

// Assigns every member of a seating group to one table in a single batch,
// each getting whatever seats they still have remaining (capped so the
// table never goes over capacity) - the "add a whole group in one click"
// action.
export async function assignGroupToTable(
  group: SeatingGroup,
  tableId: string,
  remainingByEntryId: Map<string, number>,
  tableRemainingCapacity: number,
): Promise<void> {
  const batch = writeBatch(db);
  let capacityLeft = tableRemainingCapacity;

  for (const entryId of group.memberEntryIds) {
    const remaining = remainingByEntryId.get(entryId) ?? 0;
    if (remaining <= 0 || capacityLeft <= 0) continue;
    const seatsToAssign = Math.min(remaining, capacityLeft);
    capacityLeft -= seatsToAssign;
    batch.set(doc(db, SEATING_ASSIGNMENTS_COLLECTION, assignmentId(entryId, tableId)), {
      rosterEntryId: entryId,
      tableId,
      seatsCount: seatsToAssign,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
}
