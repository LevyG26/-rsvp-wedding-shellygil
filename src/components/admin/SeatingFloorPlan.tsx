import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Disc3, DoorOpen, Maximize2, Minus, Music, Plus, Tag, Wine } from 'lucide-react';
import type { SeatingTable, SeatingTableLayout, SeatingTableShape } from '../../services/seating';
import type { VenueObject, VenueObjectType } from '../../services/venueObjects';

const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 900;
const MIN_SIZE = 50;
const MAX_SIZE = 400;
const MIN_SCALE = 0.35;
const MAX_SCALE = 1.5;
const SCALE_STEP = 0.15;
// Anything less than this many pixels of total pointer travel counts as a
// "click" (select the item) rather than a drag - otherwise every attempt to
// just select something would nudge it by a pixel or two first.
const CLICK_THRESHOLD = 4;
// How far (in canvas units) a Ctrl+V duplicate is offset from the original,
// so the copy doesn't land exactly on top of it and look like nothing
// happened.
const DUPLICATE_OFFSET = 30;

// Freeform shape outlines for 'teardrop' and 'curved' tables - a plain
// Tailwind border-radius can only ever draw a circle/ellipse or a rounded
// rectangle, never an actual petal or scalloped-booth silhouette, so these
// two shapes are drawn as their own SVG path instead. Each path lives in its
// own small, fixed viewBox and is stretched to fill whatever box Gil resizes
// the table to (preserveAspectRatio="none") - not pixel-perfect at extreme
// aspect ratios, but reads clearly as "teardrop"/"curved booth" at the sizes
// tables actually get used at.
//
// 'teardrop': a simple, unmistakable water-drop outline - point at the top,
// rounded bulb at the bottom. Matches the petal-shaped tables in the venue
// sketch (04/10/12/18) once rotated to the right orientation per table.
const TEARDROP_PATH = 'M50 4C50 4 18 46 18 70C18 87.12 32.88 100 50 100C67.12 100 82 87.12 82 70C82 46 50 4 50 4Z';
// 'curved': the same thick crescent/arc-band idea as above, but with the
// outer edge built from a chain of small outward bumps (like the individual
// chair backs in the sketch) instead of one perfectly smooth arc - a plain
// smooth crescent reads as a "moon", not the long scalloped row of chairs
// bent around a shared curve that these booth tables actually are (07/08/
// 09/13/14/21 in the sketch).
const CURVED_PATH =
  'M 10.0,95.0 Q 6.8,78.6 15.4,64.2 Q 18.0,47.7 31.1,37.1 Q 39.2,22.5 55.0,17.1 Q 67.6,6.1 84.4,6.4 Q 100.0,0.4 115.6,6.4 Q 132.4,6.1 145.0,17.1 Q 160.8,22.5 168.9,37.1 Q 182.0,47.7 184.6,64.2 Q 193.2,78.6 190.0,95.0 L 160,95 A 60,60 0 0 0 40,95 Z';

// Renders the freeform outline for a 'teardrop'/'curved' table as a fill +
// stroke pair (Tailwind's fill-current/stroke-current + text-* color classes
// mirror the plain round/rect tables' border+background classes exactly, so
// the selected/full/default color states stay visually consistent across
// every shape). Absolutely fills its parent and never intercepts pointer
// events itself - the table's own div still owns dragging/resizing/clicking
// exactly as it did before this shape existed.
function FreeformTableShape({ shape, rotation, fillClassName, strokeClassName }: { shape: 'teardrop' | 'curved'; rotation: number; fillClassName: string; strokeClassName: string }) {
  const d = shape === 'teardrop' ? TEARDROP_PATH : CURVED_PATH;
  const viewBox = shape === 'teardrop' ? '0 0 100 104' : '0 0 200 100';
  // Center of the viewBox above - used as the pivot for the SVG-native
  // rotate(angle, cx, cy) transform. Deliberately an SVG attribute rather
  // than a CSS `transform` style on the <svg> itself - a CSS transform on a
  // nested, preserveAspectRatio="none"-stretched <svg> renders inconsistently
  // (confirmed while building this: it silently no-ops in some SVG
  // renderers), where the plain SVG transform attribute on an inner <g> is
  // universally supported.
  const [cx, cy] = shape === 'teardrop' ? [50, 52] : [100, 50];
  return (
    <svg viewBox={viewBox} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      <g transform={`rotate(${rotation} ${cx} ${cy})`}>
        <path d={d} className={`fill-current ${fillClassName}`} />
        <path d={d} className={`stroke-current ${strokeClassName}`} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

type ItemKind = 'table' | 'object';

interface DragState {
  kind: ItemKind;
  itemId: string;
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

interface DraftLayout {
  kind: ItemKind;
  itemId: string;
  layout: SeatingTableLayout;
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
  venueObjects: VenueObject[];
  seatsUsedByTable: Map<string, number>;
  selectedTableId: string | null;
  onSelectTable: (id: string | null) => void;
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
  onLayoutChange: (id: string, layout: SeatingTableLayout) => void;
  onObjectLayoutChange: (id: string, layout: SeatingTableLayout) => void;
  onDuplicateTable: (table: SeatingTable, layout: SeatingTableLayout) => void;
  onDuplicateObject: (object: VenueObject, layout: SeatingTableLayout) => void;
  fullLabel: string;
  zoomOutLabel: string;
  zoomInLabel: string;
  zoomResetLabel: string;
  dir: 'rtl' | 'ltr';
  // Bulk-delete selection - separate from `selectedTableId`/`selectedObjectId`
  // (which are for viewing/editing one item's details below the canvas).
  // Checking an item's corner box marks it for deletion without disturbing
  // whichever single item is currently open in the detail panel.
  deleteSelection: Set<string>;
  onToggleDeleteSelection: (id: string) => void;
  deleteObjectSelection: Set<string>;
  onToggleDeleteObjectSelection: (id: string) => void;
  deleteCheckboxLabel: string;
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const OBJECT_ICONS: Record<VenueObjectType, typeof Music> = {
  stage: Music,
  bar: Wine,
  entrance: DoorOpen,
  danceFloor: Disc3,
  custom: Tag,
};

const OBJECT_COLOR_CLASSES: Record<VenueObjectType, string> = {
  stage: 'border-violet-400 bg-violet-50/90 text-violet-900 dark:border-violet-500 dark:bg-violet-950/60 dark:text-violet-100',
  bar: 'border-amber-400 bg-amber-50/90 text-amber-900 dark:border-amber-500 dark:bg-amber-950/60 dark:text-amber-100',
  entrance: 'border-cyan-400 bg-cyan-50/90 text-cyan-900 dark:border-cyan-500 dark:bg-cyan-950/60 dark:text-cyan-100',
  danceFloor: 'border-pink-400 bg-pink-50/90 text-pink-900 dark:border-pink-500 dark:bg-pink-950/60 dark:text-pink-100',
  custom: 'border-gray-400 bg-gray-50/90 text-gray-900 dark:border-slate-400 dark:bg-slate-800/90 dark:text-slate-100',
};

export const SeatingFloorPlan = forwardRef<SeatingFloorPlanHandle, SeatingFloorPlanProps>(function SeatingFloorPlan(
  {
    tables,
    venueObjects,
    seatsUsedByTable,
    selectedTableId,
    onSelectTable,
    selectedObjectId,
    onSelectObject,
    onLayoutChange,
    onObjectLayoutChange,
    onDuplicateTable,
    onDuplicateObject,
    fullLabel,
    zoomOutLabel,
    zoomInLabel,
    zoomResetLabel,
    dir,
    deleteSelection,
    onToggleDeleteSelection,
    deleteObjectSelection,
    onToggleDeleteObjectSelection,
    deleteCheckboxLabel,
  },
  ref,
) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  // Only holds an override for the item currently being dragged/resized -
  // every other item just renders straight from its own prop (which comes
  // from Firestore).
  const [draftLayout, setDraftLayout] = useState<DraftLayout | null>(null);
  const [scale, setScale] = useState(1);
  // While true, labels render without truncation/ellipsis. html2canvas
  // mis-renders Hebrew text combined with CSS text-overflow: ellipsis (it
  // garbles/reorders the characters), so we briefly switch to full, wrapped
  // text just for the capture and switch back right after.
  const [isCapturing, setIsCapturing] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<{ kind: ItemKind; item: SeatingTable | VenueObject } | null>(null);
  // Tracks a press that started directly on the canvas background (not on a
  // table/object - those call stopPropagation in startDrag, so this never
  // fires for them). Used to tell "tapped empty space to deselect" apart
  // from "started panning/scrolling the canvas from a spot between tables" -
  // without this, deselecting on the raw pointerdown fired the instant a
  // finger touched down to pan around a large floor plan, clearing whichever
  // table was selected before the pan gesture even registered as movement.
  const backgroundPressRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);

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

  const layoutForTable = (table: SeatingTable): SeatingTableLayout => {
    if (draftLayout && draftLayout.kind === 'table' && draftLayout.itemId === table.id) return draftLayout.layout;
    return { x: table.x, y: table.y, width: table.width, height: table.height, shape: table.shape, rotation: table.rotation };
  };

  const layoutForObject = (object: VenueObject): SeatingTableLayout => {
    if (draftLayout && draftLayout.kind === 'object' && draftLayout.itemId === object.id) return draftLayout.layout;
    return { x: object.x, y: object.y, width: object.width, height: object.height, shape: object.shape, rotation: object.rotation };
  };

  const startDrag = (
    event: React.PointerEvent,
    kind: ItemKind,
    item: { id: string; x: number; y: number; width: number; height: number },
    mode: 'move' | 'resize',
  ) => {
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const next: DragState = {
      kind,
      itemId: item.id,
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: item.x,
      originY: item.y,
      originWidth: item.width,
      originHeight: item.height,
      moved: false,
    };
    dragStateRef.current = next;
    setDragState(next);
  };

  const shapeFor = (kind: ItemKind, itemId: string): SeatingTableShape => {
    if (kind === 'table') return tables.find((t) => t.id === itemId)?.shape ?? 'round';
    return venueObjects.find((o) => o.id === itemId)?.shape ?? 'rect';
  };

  // Dragging/resizing never changes a table's facing direction - only the
  // dedicated rotate button does - so every draft layout built during a drag
  // just carries the item's current rotation straight through unchanged.
  const rotationFor = (kind: ItemKind, itemId: string): number => {
    if (kind === 'table') return tables.find((t) => t.id === itemId)?.rotation ?? 0;
    return venueObjects.find((o) => o.id === itemId)?.rotation ?? 0;
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const current = dragStateRef.current;
    if (!current || event.pointerId !== current.pointerId) return;

    // Screen-space pointer movement has to be divided by the current zoom
    // level to get the equivalent movement in canvas coordinates - otherwise
    // items would drift faster/slower than the pointer at any zoom other
    // than 100%.
    const deltaX = (event.clientX - current.startClientX) / scale;
    const deltaY = (event.clientY - current.startClientY) / scale;
    if (!current.moved && Math.hypot(deltaX, deltaY) > CLICK_THRESHOLD) {
      current.moved = true;
    }

    const shape = shapeFor(current.kind, current.itemId);
    const rotation = rotationFor(current.kind, current.itemId);

    if (current.mode === 'move') {
      const x = clamp(current.originX + deltaX, 0, CANVAS_WIDTH - current.originWidth);
      const y = clamp(current.originY + deltaY, 0, CANVAS_HEIGHT - current.originHeight);
      setDraftLayout({ kind: current.kind, itemId: current.itemId, layout: { x, y, width: current.originWidth, height: current.originHeight, shape, rotation } });
    } else {
      const width = clamp(current.originWidth + deltaX, MIN_SIZE, MAX_SIZE);
      const height = clamp(current.originHeight + deltaY, MIN_SIZE, MAX_SIZE);
      setDraftLayout({ kind: current.kind, itemId: current.itemId, layout: { x: current.originX, y: current.originY, width, height, shape, rotation } });
    }
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    const current = dragStateRef.current;
    if (!current || event.pointerId !== current.pointerId) return;

    if (!current.moved) {
      // A plain click/tap - select this item instead of moving it. Table and
      // object selection are mutually exclusive, since only one detail panel
      // can be open at a time.
      if (current.kind === 'table') {
        onSelectTable(current.itemId);
        onSelectObject(null);
      } else {
        onSelectObject(current.itemId);
        onSelectTable(null);
      }
      setDraftLayout(null);
    } else {
      const finalLayout = draftLayout && draftLayout.kind === current.kind && draftLayout.itemId === current.itemId
        ? draftLayout.layout
        : { x: current.originX, y: current.originY, width: current.originWidth, height: current.originHeight, shape: shapeFor(current.kind, current.itemId), rotation: rotationFor(current.kind, current.itemId) };
      if (current.kind === 'table') onLayoutChange(current.itemId, finalLayout);
      else onObjectLayoutChange(current.itemId, finalLayout);
      // Keep showing the drafted position until the next Firestore snapshot
      // catches up, so the shape doesn't jump back and then forward again.
    }

    dragStateRef.current = null;
    setDragState(null);
  };

  const zoomOut = () => setScale((prev) => clamp(Math.round((prev - SCALE_STEP) * 100) / 100, MIN_SCALE, MAX_SCALE));
  const zoomIn = () => setScale((prev) => clamp(Math.round((prev + SCALE_STEP) * 100) / 100, MIN_SCALE, MAX_SCALE));
  const zoomReset = () => setScale(1);

  // Ctrl+scroll (or a trackpad pinch, which browsers report as a wheel event
  // with ctrlKey set) zooms the canvas - an addition to the +/- buttons so
  // Gil doesn't have to move his hand off the mouse while exploring a large
  // plan. Needs a real (non-React) event listener with { passive: false } so
  // preventDefault can actually stop the page itself from zooming/scrolling.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setScale((prev) => clamp(Math.round((prev + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP)) * 100) / 100, MIN_SCALE, MAX_SCALE));
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Ctrl+C / Ctrl+V duplicates whichever table or object is currently
  // selected - an in-app "clipboard" (not the real OS clipboard, which
  // wouldn't mean anything for a canvas shape) so Gil can quickly stamp out
  // copies instead of re-creating them from the add-table/add-object forms
  // each time. Ignored while typing in any input/textarea, and ignored
  // entirely when nothing on the canvas is selected, so normal text
  // copy/paste elsewhere on the page is never affected.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      const key = event.key.toLowerCase();
      if (key === 'c') {
        if (selectedTableId) {
          const table = tables.find((t) => t.id === selectedTableId);
          if (table) clipboardRef.current = { kind: 'table', item: table };
        } else if (selectedObjectId) {
          const object = venueObjects.find((o) => o.id === selectedObjectId);
          if (object) clipboardRef.current = { kind: 'object', item: object };
        }
      } else if (key === 'v' && clipboardRef.current) {
        event.preventDefault();
        const { kind, item } = clipboardRef.current;
        const layout = {
          x: clamp(item.x + DUPLICATE_OFFSET, 0, CANVAS_WIDTH - item.width),
          y: clamp(item.y + DUPLICATE_OFFSET, 0, CANVAS_HEIGHT - item.height),
          width: item.width,
          height: item.height,
          shape: item.shape,
          rotation: item.rotation,
        };
        if (kind === 'table') onDuplicateTable(item as SeatingTable, layout);
        else onDuplicateObject(item as VenueObject, layout);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTableId, selectedObjectId, tables, venueObjects, onDuplicateTable, onDuplicateObject]);

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
        ref={scrollContainerRef}
        className="overflow-auto rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/40 dark:border-slate-700 dark:bg-slate-800/40"
        style={{ height: 480, overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        <div style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
          <div
            ref={canvasRef}
            dir={dir}
            className="relative bg-[radial-gradient(circle,rgba(0,0,0,0.06)_1px,transparent_1px)] bg-[length:24px_24px] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.12)_1px,transparent_1px)]"
            style={{
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            onPointerDown={(event) => {
              backgroundPressRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
            }}
            onPointerMove={(event) => {
              const press = backgroundPressRef.current;
              if (!press || event.pointerId !== press.pointerId) return;
              if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_THRESHOLD) {
                // Moved enough to be a pan/scroll, not a tap - stop tracking
                // it as a potential deselect-click.
                backgroundPressRef.current = null;
              }
            }}
            onPointerUp={(event) => {
              const press = backgroundPressRef.current;
              backgroundPressRef.current = null;
              if (press && event.pointerId === press.pointerId) {
                onSelectTable(null);
                onSelectObject(null);
              }
            }}
            onPointerCancel={() => {
              backgroundPressRef.current = null;
            }}
          >
            {tables.map((table) => {
              const layout = layoutForTable(table);
              const used = seatsUsedByTable.get(table.id) ?? 0;
              const isFull = used >= table.seatCount;
              const isSelected = selectedTableId === table.id;
              const isDragging = dragState?.kind === 'table' && dragState.itemId === table.id;
              // 'teardrop'/'curved' draw their own outline via an SVG path
              // (see FreeformTableShape) instead of a Tailwind border-radius
              // trick, since neither shape is expressible as a circle,
              // ellipse, or rounded rectangle.
              const isFreeform = table.shape === 'teardrop' || table.shape === 'curved';
              const fillClassName = isSelected
                ? 'text-white dark:text-slate-700'
                : isFull
                  ? 'text-emerald-50 dark:text-emerald-900'
                  : 'text-blue-50/90 dark:text-blue-900';
              const strokeClassName = isSelected
                ? 'text-gray-900 dark:text-slate-100'
                : isFull
                  ? 'text-emerald-300 dark:text-emerald-500'
                  : 'text-blue-200 dark:text-blue-500';

              return (
                <div
                  key={table.id}
                  onPointerDown={(event) => startDrag(event, 'table', table, 'move')}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`absolute flex select-none flex-col items-center justify-center p-1 text-center ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${
                    isFreeform
                      ? ''
                      : `border-2 shadow-sm dark:shadow-none ${table.shape === 'round' ? 'rounded-full' : 'rounded-xl'} ${isSelected ? 'border-gray-900 bg-white ring-2 ring-gray-900/20 dark:border-slate-100 dark:bg-slate-700 dark:ring-slate-100/30' : isFull ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-900' : 'border-blue-200 bg-blue-50/90 dark:border-blue-500 dark:bg-blue-900'}`
                  } ${deleteSelection.has(table.id) ? 'outline outline-2 outline-offset-2 outline-rose-500' : ''}`}
                  style={{ left: layout.x, top: layout.y, width: layout.width, height: layout.height, touchAction: 'none' }}
                >
                  {isFreeform && (
                    <FreeformTableShape
                      shape={table.shape as 'teardrop' | 'curved'}
                      rotation={layout.rotation ?? 0}
                      fillClassName={fillClassName}
                      strokeClassName={strokeClassName}
                    />
                  )}
                  {!isCapturing && (
                    <input
                      type="checkbox"
                      checked={deleteSelection.has(table.id)}
                      onChange={() => onToggleDeleteSelection(table.id)}
                      onPointerDown={(event) => event.stopPropagation()}
                      title={deleteCheckboxLabel}
                      aria-label={deleteCheckboxLabel}
                      className="absolute left-1 top-1 h-4 w-4 cursor-pointer accent-rose-600"
                      style={{ touchAction: 'none' }}
                    />
                  )}
                  <span
                    className={`relative max-w-full px-1 text-xs font-semibold text-gray-900 dark:text-slate-100 ${isCapturing ? 'whitespace-normal break-words' : 'truncate whitespace-nowrap'}`}
                  >
                    {table.name}
                  </span>
                  <span className="relative text-[11px] text-gray-600 dark:text-slate-400">
                    {used}/{table.seatCount}
                    {isFull ? ` · ${fullLabel}` : ''}
                  </span>
                  <div
                    onPointerDown={(event) => startDrag(event, 'table', table, 'resize')}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="absolute bottom-0 right-0 h-6 w-6 cursor-nwse-resize rounded-tl-md bg-gray-400/70 hover:bg-gray-500 dark:bg-slate-500/70 dark:hover:bg-slate-400"
                    style={{ touchAction: 'none' }}
                  />
                </div>
              );
            })}

            {venueObjects.map((object) => {
              const layout = layoutForObject(object);
              const isSelected = selectedObjectId === object.id;
              const isDragging = dragState?.kind === 'object' && dragState.itemId === object.id;
              const Icon = OBJECT_ICONS[object.type];

              return (
                <div
                  key={object.id}
                  onPointerDown={(event) => startDrag(event, 'object', object, 'move')}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`absolute flex select-none flex-col items-center justify-center gap-0.5 border-2 border-dashed p-1 text-center ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${object.shape === 'round' ? 'rounded-full' : 'rounded-lg'} ${deleteObjectSelection.has(object.id) ? 'outline outline-2 outline-offset-2 outline-rose-500' : ''} ${isSelected ? 'ring-2 ring-gray-900/30 dark:ring-slate-100/30' : ''} ${OBJECT_COLOR_CLASSES[object.type]}`}
                  style={{ left: layout.x, top: layout.y, width: layout.width, height: layout.height, touchAction: 'none' }}
                >
                  {!isCapturing && (
                    <input
                      type="checkbox"
                      checked={deleteObjectSelection.has(object.id)}
                      onChange={() => onToggleDeleteObjectSelection(object.id)}
                      onPointerDown={(event) => event.stopPropagation()}
                      title={deleteCheckboxLabel}
                      aria-label={deleteCheckboxLabel}
                      className="absolute left-1 top-1 h-4 w-4 cursor-pointer accent-rose-600"
                      style={{ touchAction: 'none' }}
                    />
                  )}
                  <Icon size={14} />
                  <span className={`max-w-full px-1 text-[11px] font-semibold ${isCapturing ? 'whitespace-normal break-words' : 'truncate whitespace-nowrap'}`}>
                    {object.label}
                  </span>
                  <div
                    onPointerDown={(event) => startDrag(event, 'object', object, 'resize')}
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
