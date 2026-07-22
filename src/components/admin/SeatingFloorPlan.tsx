import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import type { SeatingTable, SeatingTableLayout } from '../../services/seating';

const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 900;
const MIN_SIZE = 50;
const MAX_SIZE = 400;
const MIN_SCALE = 0.35;
const MAX_SCALE = 1.5;
const SCALE_STEP = 0.15;
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

export interface SeatingFloorPlanHandle {
  // Temporarily resets zoom to 100% (so the exported image is always
  // consistent regardless of whatever zoom level Gil happens to be looking
  // at), captures the canvas, downloads it as a PNG, then restores whatever
  // zoom he had before.
  exportImage: (fileName: string) => Promise<void>;
}

interface SeatingFloorPlanProps {
  tables: SeatingTable[];
  seatsUsedByTable: Map<string, number>;
  selectedTableId: string | null;
  onSelectTable: (id: string | null) => void;
  onLayoutChange: (id: string, layout: SeatingTableLayout) => void;
  fullLabel: string;
  zoomOutLabel: string;
  zoomInLabel: string;
  zoomResetLabel: string;
  dir: 'rtl' | 'ltr';
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export const SeatingFloorPlan = forwardRef<SeatingFloorPlanHandle, SeatingFloorPlanProps>(function SeatingFloorPlan(
  { tables, seatsUsedByTable, selectedTableId, onSelectTable, onLayoutChange, fullLabel, zoomOutLabel, zoomInLabel, zoomResetLabel, dir },
  ref,
) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  // Only holds an override for the table currently being dragged/resized -
  // every other table just renders straight from the `tables` prop (which
  // comes from Firestore).
  const [draftLayout, setDraftLayout] = useState<{ tableId: string; layout: SeatingTableLayout } | null>(null);
  const [scale, setScale] = useState(1);
  // While true, table-name labels render without truncation/ellipsis.
  // html2canvas mis-renders Hebrew text combined with CSS text-overflow:
  // ellipsis (it garbles/reorders the characters), so we briefly switch to
  // full, wrapped text just for the capture and switch back right after.
  const [isCapturing, setIsCapturing] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    exportImage: async (fileName: string) => {
      const previousScale = scale;
      setIsCapturing(true);
      setScale(1);
      await waitForNextPaint();
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
        const node = canvasRef.current;
        if (!node) return;
        // Tailwind v4's default palette uses modern oklch()/oklab() color
        // functions, which the original html2canvas can't parse - the
        // "-pro" fork adds support for those, so the exported PNG doesn't
        // throw on every element styled with a Tailwind color class.
        const { default: html2canvas } = await import('html2canvas-pro');
        const canvas = await html2canvas(node, { backgroundColor: '#f9fafb', scale: 2 });
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName;
        link.click();
      } finally {
        setIsCapturing(false);
        setScale(previousScale);
      }
    },
  }), [scale]);

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

    // Screen-space pointer movement has to be divided by the current zoom
    // level to get the equivalent movement in canvas coordinates - otherwise
    // tables would drift faster/slower than the pointer at any zoom other
    // than 100%.
    const deltaX = (event.clientX - current.startClientX) / scale;
    const deltaY = (event.clientY - current.startClientY) / scale;
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

  const zoomOut = () => setScale((prev) => Math.max(MIN_SCALE, Math.round((prev - SCALE_STEP) * 100) / 100));
  const zoomIn = () => setScale((prev) => Math.min(MAX_SCALE, Math.round((prev + SCALE_STEP) * 100) / 100));
  const zoomReset = () => setScale(1);

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-1">
        <button type="button" onClick={zoomOut} title={zoomOutLabel} className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
          <Minus size={14} />
        </button>
        <button type="button" onClick={zoomReset} title={zoomResetLabel} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
          {Math.round(scale * 100)}%
        </button>
        <button type="button" onClick={zoomIn} title={zoomInLabel} className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
          <Plus size={14} />
        </button>
        <button type="button" onClick={zoomReset} title={zoomResetLabel} className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
          <Maximize2 size={14} />
        </button>
      </div>
      <div
        className="overflow-auto rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/40 dark:border-slate-700 dark:bg-slate-800/40"
        style={{ height: 480, overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        <div style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
          <div
            ref={canvasRef}
            dir={dir}
            className="relative"
            style={{
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
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
                  className={`absolute flex select-none flex-col items-center justify-center border-2 p-1 text-center shadow-sm ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${table.shape === 'round' ? 'rounded-full' : 'rounded-xl'} ${isSelected ? 'border-gray-900 bg-white ring-2 ring-gray-900/20 dark:border-slate-200 dark:bg-slate-800 dark:ring-slate-200/20' : isFull ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/50' : 'border-blue-200 bg-blue-50/90 dark:border-blue-800 dark:bg-blue-950/50'}`}
                  style={{ left: layout.x, top: layout.y, width: layout.width, height: layout.height, touchAction: 'none' }}
                >
                  <span
                    className={`max-w-full px-1 text-xs font-semibold text-gray-900 dark:text-slate-100 ${isCapturing ? 'whitespace-normal break-words' : 'truncate whitespace-nowrap'}`}
                  >
                    {table.name}
                  </span>
                  <span className="text-[11px] text-gray-600 dark:text-slate-400">
                    {used}/{table.seatCount}
                    {isFull ? ` · ${fullLabel}` : ''}
                  </span>
                  <div
                    onPointerDown={(event) => startDrag(event, table, 'resize')}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="absolute bottom-0 right-0 h-6 w-6 cursor-nwse-resize rounded-tl-md bg-gray-400/70 hover:bg-gray-500 dark:bg-slate-500/70 dark:hover:bg-slate-400"
                    style={{ touchAction: 'none' }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
