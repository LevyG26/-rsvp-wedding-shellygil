import { useRef, useState } from 'react';
import type { SeatingTable, SeatingTableLayout } from '../../services/seating';

const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 900;
const MIN_SIZE = 50;
const MAX_SIZE = 400;
// Anything less than this many pixels of total pointer travel counts as a
// "click" (select the table) rather than a drag - otherwise every attempt to
// just select a table would nudge it by a pixel or two first.
const CLICK_THRESHOLD = 4;

interface DragState {
  tableId: string;
  mode: 'move' | 'resize';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
  moved: boolean;
}

interface SeatingFloorPlanProps {
  tables: SeatingTable[];
  seatsUsedByTable: Map<string, number>;
  selectedTableId: string | null;
  onSelectTable: (id: string | null) => void;
  onLayoutChange: (id: string, layout: SeatingTableLayout) => void;
  fullLabel: string;
}

export function SeatingFloorPlan({ tables, seatsUsedByTable, selectedTableId, onSelectTable, onLayoutChange, fullLabel }: SeatingFloorPlanProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  // Only holds an override for the table currently being dragged/resized -
  // every other table just renders straight from the `tables` prop (which
  // comes from Firestore).
  const [draftLayout, setDraftLayout] = useState<{ tableId: string; layout: SeatingTableLayout } | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  const layoutFor = (table: SeatingTable): SeatingTableLayout => {
    if (draftLayout && draftLayout.tableId === table.id) return draftLayout.layout;
    return { x: table.x, y: table.y, width: table.width, height: table.height, shape: table.shape };
  };

  const startDrag = (event: React.PointerEvent, table: SeatingTable, mode: 'move' | 'resize') => {
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const next: DragState = {
      tableId: table.id,
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: table.x,
      originY: table.y,
      originWidth: table.width,
      originHeight: table.height,
      moved: false,
    };
    dragStateRef.current = next;
    setDragState(next);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const current = dragStateRef.current;
    if (!current || event.pointerId !== current.pointerId) return;

    const deltaX = event.clientX - current.startClientX;
    const deltaY = event.clientY - current.startClientY;
    if (!current.moved && Math.hypot(deltaX, deltaY) > CLICK_THRESHOLD) {
      current.moved = true;
    }

    if (current.mode === 'move') {
      const x = Math.max(0, Math.min(CANVAS_WIDTH - current.originWidth, current.originX + deltaX));
      const y = Math.max(0, Math.min(CANVAS_HEIGHT - current.originHeight, current.originY + deltaY));
      setDraftLayout({ tableId: current.tableId, layout: { x, y, width: current.originWidth, height: current.originHeight, shape: tables.find((t) => t.id === current.tableId)?.shape ?? 'round' } });
    } else {
      const width = Math.max(MIN_SIZE, Math.min(MAX_SIZE, current.originWidth + deltaX));
      const height = Math.max(MIN_SIZE, Math.min(MAX_SIZE, current.originHeight + deltaY));
      setDraftLayout({ tableId: current.tableId, layout: { x: current.originX, y: current.originY, width, height, shape: tables.find((t) => t.id === current.tableId)?.shape ?? 'round' } });
    }
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    const current = dragStateRef.current;
    if (!current || event.pointerId !== current.pointerId) return;

    if (!current.moved) {
      // A plain click/tap - select this table instead of moving it.
      onSelectTable(current.tableId);
      setDraftLayout(null);
    } else {
      const table = tables.find((t) => t.id === current.tableId);
      const finalLayout = draftLayout?.tableId === current.tableId
        ? draftLayout.layout
        : { x: current.originX, y: current.originY, width: current.originWidth, height: current.originHeight, shape: table?.shape ?? 'round' };
      onLayoutChange(current.tableId, finalLayout);
      // Keep showing the drafted position until the next Firestore snapshot
      // catches up, so the shape doesn't jump back and then forward again.
    }

    dragStateRef.current = null;
    setDragState(null);
  };

  return (
    <div className="overflow-auto rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/40" style={{ height: 520 }}>
      <div
        className="relative"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        onPointerDown={() => onSelectTable(null)}
      >
        {tables.map((table) => {
          const layout = layoutFor(table);
          const used = seatsUsedByTable.get(table.id) ?? 0;
          const isFull = used >= table.seatCount;
          const isSelected = selectedTableId === table.id;
          const isDragging = dragState?.tableId === table.id;

          return (
            <div
              key={table.id}
              onPointerDown={(event) => startDrag(event, table, 'move')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`absolute flex select-none flex-col items-center justify-center border-2 p-1 text-center shadow-sm ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${table.shape === 'round' ? 'rounded-full' : 'rounded-xl'} ${isSelected ? 'border-gray-900 bg-white ring-2 ring-gray-900/20' : isFull ? 'border-emerald-300 bg-emerald-50' : 'border-blue-200 bg-blue-50/90'}`}
              style={{ left: layout.x, top: layout.y, width: layout.width, height: layout.height, touchAction: 'none' }}
            >
              <span className="max-w-full truncate px-1 text-xs font-semibold text-gray-900">{table.name}</span>
              <span className="text-[11px] text-gray-600">
                {used}/{table.seatCount}
                {isFull ? ` · ${fullLabel}` : ''}
              </span>
              <div
                onPointerDown={(event) => startDrag(event, table, 'resize')}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="absolute bottom-0.5 right-0.5 h-4 w-4 cursor-nwse-resize rounded-tl-md bg-gray-400/70 hover:bg-gray-500"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
