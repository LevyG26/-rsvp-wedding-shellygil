import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { GuestRosterEntry } from './guestRoster';

export const SEATING_TABLES_COLLECTION = 'seatingTables';
export const SEATING_ASSIGNMENTS_COLLECTION = 'seatingAssignments';
export const SEATING_ALERTS_COLLECTION = 'seatingAlerts';
export const SEATING_SETTINGS_COLLECTION = 'seatingSettings';
// Single, well-known doc id - there's only ever one floor plan, so this
// isn't keyed per-table/per-user the way everything else here is.
export const SEATING_SETTINGS_DOC_ID = 'floorPlan';

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
  // Running total of seats currently assigned at this table, maintained
  // transactionally by setSeatingAssignment/removeSeatingAssignment - lets
  // a seat-count change enforce the table's capacity from inside a single
  // Firestore transaction using only transaction.get(docRef) reads (this
  // SDK's transactions can only read individual documents, not a query
  // summing every assignment at the table), which is what actually closes
  // the race where two staff phones seat different walk-ins into the same
  // table's last seat(s) at once. `undefined` means this table predates the
  // field (or has never had a seating change since it was added) - the
  // first assignment write touching such a table computes the true total
  // from the live assignments collection and seeds the counter from there,
  // so it only ever needs that fallback once per table.
  seatsUsed?: number;
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
    // Deliberately NOT numberOr(.... 0) - see the seatsUsed doc comment on
    // SeatingTable: undefined (missing field) and 0 (confirmed empty table)
    // must stay distinguishable so setSeatingAssignment knows whether to
    // trust this value or recompute it from scratch.
    seatsUsed: typeof data.seatsUsed === 'number' && Number.isFinite(data.seatsUsed) ? data.seatsUsed : undefined,
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

// "notConfirmed" covers no/null/deleted (all their seats freed), "reducedCount"
// covers a still-confirmed entry whose headcount dropped (some seats freed),
// "needsMoreSeats" covers the opposite case - a still-confirmed entry whose
// headcount GREW past what's currently assigned - see
// syncSeatingAssignmentsWithRoster below for exactly when each is used.
export type SeatingAlertReason = 'notConfirmed' | 'reducedCount' | 'needsMoreSeats';

// A record of "Gil had seated this guest, then their confirmed status/count
// changed enough that seating needs attention" - purely informational (Gil
// dismisses one by deleting it once he's seen it, or the sync itself clears
// a "needsMoreSeats" one automatically once he's added the extra seat(s)),
// so the guest's name/category/table name are snapshotted onto the alert
// itself rather than looked up live - the whole point is to stay meaningful
// even after the roster entry or table that caused it is gone. `seatsCount`
// means "seats freed up" for notConfirmed/reducedCount, and "seats still
// needed" for needsMoreSeats - see the message copy in SeatingSection.tsx,
// which phrases each reason differently.
export interface SeatingAlert {
  id: string;
  guestName: string;
  category: string;
  tableName: string;
  seatsCount: number;
  reason: SeatingAlertReason;
  // Gil dismissing an alert used to just delete the doc outright - but
  // syncSeatingAssignmentsWithRoster runs again on the very next
  // roster/assignments/alerts change (which dismissing one IS, since it's
  // an alerts change), and if the exact same mismatch it was raised for is
  // still true, it just wrote the identical alert straight back with a new
  // id-deterministic setDoc - Gil dismissing it had no lasting effect. Now
  // dismissal sets this flag instead of deleting, and the sync function
  // below skips re-raising an alert whose dismissed snapshot still matches
  // the current situation exactly - only a genuinely NEW development (the
  // guest's headcount/table/reason actually changed since the dismiss)
  // clears the flag and shows it again.
  dismissed: boolean;
}

function normalizeAlert(id: string, data: Record<string, unknown>): SeatingAlert {
  const seatsCountValue = data.seatsCount;
  return {
    id,
    guestName: typeof data.guestName === 'string' ? data.guestName : '',
    category: typeof data.category === 'string' ? data.category : '',
    tableName: typeof data.tableName === 'string' ? data.tableName : '',
    seatsCount: typeof seatsCountValue === 'number' && Number.isFinite(seatsCountValue) ? seatsCountValue : 0,
    reason: data.reason === 'reducedCount' ? 'reducedCount' : data.reason === 'needsMoreSeats' ? 'needsMoreSeats' : 'notConfirmed',
    dismissed: data.dismissed === true,
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

// Marks the alert dismissed rather than deleting it outright - see the
// `dismissed` field comment on SeatingAlert above for why a hard delete
// didn't actually stick.
export async function dismissSeatingAlert(id: string): Promise<void> {
  await updateDoc(doc(db, SEATING_ALERTS_COLLECTION, id), { dismissed: true });
}

// Whether free-drag repositioning on the floor-plan canvas is frozen -
// shared across every device/admin (not a personal per-browser preference),
// since the whole point is that whoever locks it protects the layout from
// anyone else who has the dashboard open, not just themselves. Defaults to
// unlocked (false) when the doc doesn't exist yet, so nothing changes for
// existing users until someone actually locks it once.
export function subscribeToSeatingLayoutLock(onChange: (locked: boolean) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    doc(db, SEATING_SETTINGS_COLLECTION, SEATING_SETTINGS_DOC_ID),
    (snapshot) => onChange(snapshot.data()?.layoutLocked === true),
    (error) => {
      console.error('Seating layout lock live listener failed', error);
      onError?.(error);
    },
  );
}

export async function setSeatingLayoutLock(locked: boolean): Promise<void> {
  await setDoc(doc(db, SEATING_SETTINGS_COLLECTION, SEATING_SETTINGS_DOC_ID), {
    layoutLocked: locked,
    updatedAt: serverTimestamp(),
  });
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

// Thrown by setSeatingAssignment when honoring the request would seat more
// people at a table than it has room for. Kept as a distinct class (rather
// than a plain Error) so callers - SeatingSection.tsx's handleAddToTable/
// handleAssignmentSeatsChange - can tell "someone else just filled this
// table" apart from a generic save failure and show a message that actually
// explains what happened.
//
// TEMPORARILY UNUSED (2026-08-24): this was going to be thrown by a
// transactional capacity check in setSeatingAssignment below, closing the
// rare race where two staff phones seat different walk-ins into the same
// table's last seat(s) at once. That transactional version is reverted for
// now - right after it shipped, Gil's Firestore usage spiked hard enough to
// exhaust the daily free quota, and while it was never confirmed as the
// cause, it was the single riskiest, most complex, most recently-changed
// piece of write logic (new per-write reads, new contention on table docs,
// automatic retries under this SDK's transactions) and reverting it was the
// safest immediate way to rule it out while Gil urgently needed the app
// usable again. The type is kept so SeatingSection.tsx's existing
// SeatingCapacityError handling compiles unchanged - revisit the real fix
// later, with a proper backfill and without the cold-start query this
// version added, once there's room to test it without live-production risk.
export class SeatingCapacityError extends Error {
  seatsAvailable: number;
  constructor(seatsAvailable: number) {
    super('seating-capacity-exceeded');
    this.name = 'SeatingCapacityError';
    this.seatsAvailable = seatsAvailable;
  }
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

// Deterministic per-(entry, cause) id rather than a random one - critical
// when two admins have the dashboard open at once (see Gil's report of
// duplicate alerts): both sessions can independently notice the same
// over/under-assignment before either one's write has propagated back to
// the other, and both would otherwise create their own separate alert doc
// for the exact same event. A shared, predictable id means the second
// session's write just overwrites the first session's - one doc, not two -
// and it doubles as the key a later pass uses to update or clear that same
// alert in place instead of piling up a fresh one every time this runs.
function removalAlertId(rosterEntryId: string, tableId: string): string {
  return `${rosterEntryId}__${tableId}`;
}

function needsMoreSeatsAlertId(rosterEntryId: string): string {
  return `${rosterEntryId}__needsMore`;
}

async function upsertSeatingAlert(id: string, input: {
  guestName: string;
  category: string;
  tableName: string;
  seatsCount: number;
  reason: SeatingAlertReason;
}): Promise<void> {
  await setDoc(doc(db, SEATING_ALERTS_COLLECTION, id), {
    ...input,
    dismissed: false,
    createdAt: serverTimestamp(),
  });
}

// True when `existing` is a dismissed alert whose snapshot already
// describes exactly the situation `next` would raise - i.e. nothing has
// actually changed since Gil dismissed it, so re-raising it would just
// silently undo the dismissal (see the SeatingAlert.dismissed comment).
function alertAlreadyDismissedForSameSituation(
  existing: SeatingAlert | undefined,
  next: { guestName: string; category: string; tableName: string; seatsCount: number; reason: SeatingAlertReason },
): boolean {
  return (
    existing?.dismissed === true &&
    existing.guestName === next.guestName &&
    existing.category === next.category &&
    existing.tableName === next.tableName &&
    existing.seatsCount === next.seatsCount &&
    existing.reason === next.reason
  );
}

// Keeps seating assignments honest against each roster entry's CURRENT
// confirmed status/headcount - meant to be called every time the roster,
// the assignments, or the alerts themselves change (see the guarded effect
// in AdminDashboard.tsx), so this reacts automatically whenever a guest
// edits their RSVP, Gil edits their status/count by hand, or a linked RSVP
// is deleted/reverted - not just when someone happens to click a "sync"
// button.
//
// Handles both directions of "seating no longer matches the roster":
//
// 1. Over-assigned (the guest un-RSVP'd, or their headcount dropped below
//    what's currently seated) - without this, the seatingAssignment row
//    would just survive on its own forever, quietly "occupying" a seat the
//    seating UI can no longer identify (it only ever looks up CONFIRMED
//    roster entries, so the table would just show a mysterious "-"). Trims
//    just enough of that entry's assignments - starting from whichever
//    tables they're seated at, in no particular order, since which specific
//    table loses a seat first doesn't matter here - down to what they're
//    actually allowed, and raises one alert per table touched.
//
// 2. Under-assigned (the guest is still confirmed and already seated, but
//    their headcount GREW past what's currently assigned - e.g. edited from
//    1 to 2 people). Never auto-picks a table for the extra seat(s) - there
//    might not be room at their current table - so this only ever raises a
//    visible alert naming their current table(s) and how many more seats
//    are needed, for Gil to place by hand. Automatically clears that alert
//    again once he's added enough seats to catch up.
export async function syncSeatingAssignmentsWithRoster(
  entries: GuestRosterEntry[],
  assignments: SeatingAssignment[],
  tables: SeatingTable[],
  alerts: SeatingAlert[],
): Promise<void> {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const tablesById = new Map(tables.map((table) => [table.id, table]));
  const alertIds = new Set(alerts.map((alert) => alert.id));
  const alertsById = new Map(alerts.map((alert) => [alert.id, alert]));

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
    const needsMoreId = needsMoreSeatsAlertId(rosterEntryId);

    if (totalAssigned > allowedSeats) {
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

        try {
          // eslint-disable-next-line no-await-in-loop
          await setSeatingAssignment(rosterEntryId, assignment.tableId, nextSeats);
          const alertId = removalAlertId(rosterEntryId, assignment.tableId);
          const nextAlertData = {
            guestName: guestName || '-',
            category,
            tableName: table?.name ?? '-',
            seatsCount: removeFromThis,
            reason,
          };
          if (!alertAlreadyDismissedForSameSituation(alertsById.get(alertId), nextAlertData)) {
            // eslint-disable-next-line no-await-in-loop
            await upsertSeatingAlert(alertId, nextAlertData);
          }
        } catch (error) {
          console.error('Failed to sync an over-assigned seating entry', error);
        }
      }
      // Being over- and under-assigned at once isn't possible, so there's
      // nothing left to check for this entry this pass.
      continue;
    }

    if (allowedSeats > 0 && totalAssigned > 0 && totalAssigned < allowedSeats) {
      const confirmedEntry = entry as GuestRosterEntry; // allowedSeats > 0 implies entry exists and is confirmed
      const guestName = `${confirmedEntry.firstName} ${confirmedEntry.lastName}`.trim();
      const tableName = entryAssignments
        .map((assignment) => tablesById.get(assignment.tableId)?.name)
        .filter((name): name is string => Boolean(name))
        .join(', ');

      try {
        const nextAlertData = {
          guestName: guestName || '-',
          category: confirmedEntry.category,
          tableName: tableName || '-',
          seatsCount: allowedSeats - totalAssigned,
          reason: 'needsMoreSeats' as const,
        };
        if (!alertAlreadyDismissedForSameSituation(alertsById.get(needsMoreId), nextAlertData)) {
          await upsertSeatingAlert(needsMoreId, nextAlertData);
        }
      } catch (error) {
        console.error('Failed to raise a needs-more-seats seating alert', error);
      }
      continue;
    }

    // Fully in sync - clear a stale needsMoreSeats alert left over from
    // before Gil added the extra seat(s), so it doesn't keep showing a
    // resolved issue. Only bothers if one is actually known to exist, so a
    // normally-seated entry never causes a pointless write every pass.
    if (alertIds.has(needsMoreId)) {
      try {
        await dismissSeatingAlert(needsMoreId);
      } catch (error) {
        console.error('Failed to clear a resolved needs-more-seats seating alert', error);
      }
    }
  }
}
