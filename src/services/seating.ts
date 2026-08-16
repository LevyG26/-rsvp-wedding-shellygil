import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { GuestRosterEntry } from './guestRoster';

export const SEATING_TABLES_COLLECTION = 'seatingTables';
export const SEATING_GROUPS_COLLECTION = 'seatingGroups';
export const SEATING_ASSIGNMENTS_COLLECTION = 'seatingAssignments';
export const SEATING_ALERTS_COLLECTION = 'seatingAlerts';

// 'teardrop' and 'curved' exist so a table can actually look like the real
// venue sketch's petal-shaped and long scalloped-booth tables, instead of
// only ever being approximated as a plain circle or a wide oval - see the
// shape-drawing SVGs in SeatingFloorPlan.tsx for how each one is actually
// rendered.
export type SeatingTableShape = 'round' | 'rect' | 'teardrop' | 'curved';

// Position/size on the free-form floor-plan canvas Gil drags and resizes by
// hand to match the actual hall layout - kept separate from seatCount, since
// a table's physical footprint on the plan and how many people it seats are
// two different things he wants to control independently. `rotation` is
// optional (defaults to 0 = unrotated) purely so existing code that builds a
// layout without knowing about it still compiles - every table actually read
// back from Firestore always has a concrete number (see normalizeTable).
export interface SeatingTableLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: SeatingTableShape;
  rotation?: number;
}

export const DEFAULT_TABLE_LAYOUT: SeatingTableLayout = { x: 40, y: 40, width: 110, height: 110, shape: 'round', rotation: 0 };

export interface SeatingTable extends SeatingTableLayout {
  id: string;
  name: string;
  seatCount: number;
  // Degrees clockwise, only ever applied to the decorative shape drawing
  // itself (never to the name/seat-count text or the resize handle) - lets
  // Gil orient a teardrop or curved booth to match which way it actually
  // faces in the hall, independent of x/y/width/height.
  rotation: number;
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

function normalizeShape(value: unknown): SeatingTableShape {
  if (value === 'rect' || value === 'teardrop' || value === 'curved') return value;
  return 'round';
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
    shape: normalizeShape(data.shape),
    rotation: numberOr(data.rotation, 0),
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

// Why this can never be one of the two reasons that free a seat is left
// implicit ("notConfirmed" covers no/null/deleted, "reducedCount" covers a
// still-confirmed entry whose headcount just dropped) - see
// syncSeatingAssignmentsWithRoster below for exactly when each is used.
export type SeatingAlertReason = 'notConfirmed' | 'reducedCount';

// A record of "Gil had seated this guest, then their confirmed status/count
// changed enough that some of their seats had to be freed automatically" -
// purely informational (Gil dismisses these by deleting them once he's seen
// them), so the guest's name/category/table name are snapshotted onto the
// alert itself rather than looked up live - the whole point is to stay
// meaningful even after the roster entry or table that caused it is gone.
export interface SeatingAlert {
  id: string;
  guestName: string;
  category: string;
  tableName: string;
  seatsRemoved: number;
  reason: SeatingAlertReason;
}

function normalizeAlert(id: string, data: Record<string, unknown>): SeatingAlert {
  const seatsRemovedValue = data.seatsRemoved;
  return {
    id,
    guestName: typeof data.guestName === 'string' ? data.guestName : '',
    category: typeof data.category === 'string' ? data.category : '',
    tableName: typeof data.tableName === 'string' ? data.tableName : '',
    seatsRemoved: typeof seatsRemovedValue === 'number' && Number.isFinite(seatsRemovedValue) ? seatsRemovedValue : 0,
    reason: data.reason === 'reducedCount' ? 'reducedCount' : 'notConfirmed',
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

export function subscribeToSeatingAlerts(onChange: (alerts: SeatingAlert[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    collection(db, SEATING_ALERTS_COLLECTION),
    (snapshot) => onChange(snapshot.docs.map((docSnapshot) => normalizeAlert(docSnapshot.id, docSnapshot.data() as Record<string, unknown>))),
    (error) => {
      console.error('Seating alerts live listener failed', error);
      onError?.(error);
    },
  );
}

export async function dismissSeatingAlert(id: string): Promise<void> {
  await deleteDoc(doc(db, SEATING_ALERTS_COLLECTION, id));
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

export interface SeatingTableSeed {
  name: string;
  seatCount: number;
  layout: SeatingTableLayout;
}

// Creates many tables in one Firestore batch - used for one-click "generate
// from the venue sketch" imports so Gil doesn't have to open the add-table
// form and fill it in by hand a dozen-plus times. Purely additive: never
// touches any table that already exists.
export async function createSeatingTablesBulk(seeds: SeatingTableSeed[]): Promise<void> {
  const batch = writeBatch(db);
  seeds.forEach((seed) => {
    const id = makeId();
    batch.set(doc(db, SEATING_TABLES_COLLECTION, id), {
      name: seed.name.trim(),
      seatCount: seed.seatCount,
      ...seed.layout,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
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

async function createSeatingAlert(input: {
  guestName: string;
  category: string;
  tableName: string;
  seatsRemoved: number;
  reason: SeatingAlertReason;
}): Promise<void> {
  const id = makeId();
  await setDoc(doc(db, SEATING_ALERTS_COLLECTION, id), {
    ...input,
    createdAt: serverTimestamp(),
  });
}

// Keeps seating assignments honest against each roster entry's CURRENT
// confirmed status/headcount - meant to be called every time the roster or
// the assignments change (see the guarded effect in AdminDashboard.tsx), so
// this reacts automatically whenever a guest edits their RSVP, Gil edits
// their status by hand, or a linked RSVP is deleted/reverted - not just when
// someone happens to click a "sync" button.
//
// Without this, a guest who un-RSVPs (or whose invitedCount drops) after
// already being seated would silently keep "occupying" their seat forever:
// the seatingAssignment row survives on its own, but the seating UI only
// ever looks up CONFIRMED roster entries, so the table would just show a
// mysterious "-" using up a seat with no way to tell who it was or free it.
//
// For each roster entry with more seats assigned than it's currently allowed
// (0 if not confirmed/deleted, invitedCount if confirmed), trims just enough
// of that entry's assignments - starting from whichever tables they're
// seated at, in no particular order, since which specific table loses a
// seat first doesn't matter here - down to what they're actually allowed,
// and writes a SeatingAlert per table touched so Gil can see exactly who
// came out, from which table, how many seats freed up, and why.
export async function syncSeatingAssignmentsWithRoster(
  entries: GuestRosterEntry[],
  assignments: SeatingAssignment[],
  tables: SeatingTable[],
): Promise<void> {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const tablesById = new Map(tables.map((table) => [table.id, table]));

  const assignmentsByEntry = new Map<string, SeatingAssignment[]>();
  assignments.forEach((assignment) => {
    const list = assignmentsByEntry.get(assignment.rosterEntryId) ?? [];
    list.push(assignment);
    assignmentsByEntry.set(assignment.rosterEntryId, list);
  });

  for (const [rosterEntryId, entryAssignments] of assignmentsByEntry) {
    const entry = entriesById.get(rosterEntryId);
    const allowedSeats = entry && entry.knownResponse === 'yes' ? entry.invitedCount : 0;
    const totalAssigned = entryAssignments.reduce((sum, assignment) => sum + assignment.seatsCount, 0);
    if (totalAssigned <= allowedSeats) continue;

    const guestName = entry ? `${entry.firstName} ${entry.lastName}`.trim() : '';
    const category = entry?.category ?? '';
    const reason: SeatingAlertReason = entry && entry.knownResponse === 'yes' ? 'reducedCount' : 'notConfirmed';

    let seatsToFree = totalAssigned - allowedSeats;
    for (const assignment of entryAssignments) {
      if (seatsToFree <= 0) break;
      const removeFromThis = Math.min(seatsToFree, assignment.seatsCount);
      const nextSeats = assignment.seatsCount - removeFromThis;
      seatsToFree -= removeFromThis;

      const table = tablesById.get(assignment.tableId);
      // eslint-disable-next-line no-await-in-loop
      await setSeatingAssignment(rosterEntryId, assignment.tableId, nextSeats);
      // eslint-disable-next-line no-await-in-loop
      await createSeatingAlert({
        guestName: guestName || '-',
        category,
        tableName: table?.name ?? '-',
        seatsRemoved: removeFromThis,
        reason,
      });
    }
  }
}
