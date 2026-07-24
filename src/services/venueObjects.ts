import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { SeatingTableLayout, SeatingTableShape } from './seating';

export const VENUE_OBJECTS_COLLECTION = 'venueObjects';

// Non-seating decor Gil places on the floor-plan canvas alongside the dinner
// tables, so the plan can actually resemble the real hall (stage, bar,
// entrance, dance floor) instead of just floating table chips. Deliberately
// its own collection rather than shoehorned into seatingTables - these never
// have a seat count and are never assignable.
export type VenueObjectType = 'stage' | 'bar' | 'entrance' | 'danceFloor' | 'custom';

export interface VenueObject {
  id: string;
  type: VenueObjectType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: SeatingTableShape;
}

export const DEFAULT_VENUE_OBJECT_LAYOUT: SeatingTableLayout = { x: 40, y: 40, width: 160, height: 90, shape: 'rect' };

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeVenueObject(id: string, data: Record<string, unknown>): VenueObject {
  const type = data.type;
  return {
    id,
    type: type === 'stage' || type === 'bar' || type === 'entrance' || type === 'danceFloor' ? type : 'custom',
    label: typeof data.label === 'string' ? data.label : '',
    x: numberOr(data.x, DEFAULT_VENUE_OBJECT_LAYOUT.x),
    y: numberOr(data.y, DEFAULT_VENUE_OBJECT_LAYOUT.y),
    width: numberOr(data.width, DEFAULT_VENUE_OBJECT_LAYOUT.width),
    height: numberOr(data.height, DEFAULT_VENUE_OBJECT_LAYOUT.height),
    shape: data.shape === 'round' ? 'round' : 'rect',
  };
}

export function subscribeToVenueObjects(onChange: (objects: VenueObject[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    collection(db, VENUE_OBJECTS_COLLECTION),
    (snapshot) => onChange(snapshot.docs.map((docSnapshot) => normalizeVenueObject(docSnapshot.id, docSnapshot.data() as Record<string, unknown>))),
    (error) => {
      console.error('Venue objects live listener failed', error);
      onError?.(error);
    },
  );
}

export async function createVenueObject(type: VenueObjectType, label: string, layout: SeatingTableLayout = DEFAULT_VENUE_OBJECT_LAYOUT): Promise<string> {
  const id = makeId();
  await setDoc(doc(db, VENUE_OBJECTS_COLLECTION, id), {
    type,
    label: label.trim(),
    ...layout,
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function updateVenueObject(id: string, type: VenueObjectType, label: string, layout: SeatingTableLayout): Promise<void> {
  await setDoc(doc(db, VENUE_OBJECTS_COLLECTION, id), {
    type,
    label: label.trim(),
    ...layout,
    updatedAt: serverTimestamp(),
  });
}

// Lightweight partial update for dragging/resizing - mirrors
// updateSeatingTableLayout in seating.ts.
export async function updateVenueObjectLayout(id: string, layout: SeatingTableLayout): Promise<void> {
  await updateDoc(doc(db, VENUE_OBJECTS_COLLECTION, id), {
    ...layout,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteVenueObject(id: string): Promise<void> {
  await deleteDoc(doc(db, VENUE_OBJECTS_COLLECTION, id));
}
