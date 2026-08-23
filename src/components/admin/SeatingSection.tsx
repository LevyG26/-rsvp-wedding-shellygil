import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Camera,
  Check,
  CheckSquare,
  Download,
  LayoutGrid,
  List,
  Loader2,
  Map as MapIcon,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { GuestRosterEntry } from '../../services/guestRoster';
import type { SeatingAlert, SeatingAssignment, SeatingTable, SeatingTableLayout, SeatingTableShape } from '../../services/seating';
import type { VenueObject, VenueObjectType } from '../../services/venueObjects';
import { exportSeatingChart, type SeatingExportGuest, type SeatingExportListRow, type SeatingExportTable, type SeatingExportUnseatedGuest } from '../../admin/exportSeatingChart';
import { transliterateHebrew } from '../../admin/hebrewTransliteration';
import { findEnglishNameOverride, toTitleCase } from '../../admin/englishNameOverrides';
import { translations } from '../../i18n';
import { SeatingFloorPlan, type SeatingFloorPlanHandle } from './SeatingFloorPlan';

export interface SeatingLabels {
  title: string;
  subtitle: string;
  loading: string;
  statArrived: string;
  statConfirmed: string;
  statSeated: string;
  statUnseated: string;
  statTables: string;
  statSeatsAvailable: string;
  unseatedHeading: string;
  unseatedEmpty: string;
  unseatedAllSeated: string;
  searchPlaceholder: string;
  remainingOf: string;
  seatsWord: string;
  chooseTable: string;
  addButton: string;
  noTablesHint: string;
  tablesHeading: string;
  addTableButton: string;
  tableNamePlaceholder: string;
  tableSeatsPlaceholder: string;
  saveTable: string;
  noTables: string;
  tableFullBadge: string;
  canvasHint: string;
  shapeRound: string;
  shapeRect: string;
  shapeTeardrop: string;
  shapeCurved: string;
  rotateTableButton: string;
  tableDetailsHint: string;
  deleteTableConfirm: string;
  updateError: string;
  createError: string;
  deleteError: string;
  saving: string;
  zoomOutLabel: string;
  zoomInLabel: string;
  zoomResetLabel: string;
  enterFullScreenLabel: string;
  exitFullScreenLabel: string;
  exportListButton: string;
  exportImageButton: string;
  fullListSheet: string;
  exportLanguageLabel: string;
  exportLanguageOriginal: string;
  exportLanguageEnglish: string;
  exportError: string;
  rosterFirstName: string;
  rosterLastName: string;
  exportCategoryColumn: string;
  exportSeatsColumn: string;
  exportRemainingColumn: string;
  exportOccupiedLabel: string;
  viewToggleMap: string;
  viewToggleList: string;
  listSearchPlaceholder: string;
  listTableFilterAll: string;
  listStatusFilterAll: string;
  listStatusFilterSeated: string;
  listStatusFilterPartial: string;
  listStatusFilterUnseated: string;
  listColumnName: string;
  listColumnSide: string;
  listColumnCategory: string;
  listColumnInvited: string;
  listColumnStatus: string;
  listColumnTables: string;
  listEmpty: string;
  deleteCheckboxLabel: string;
  deleteSelectedButton: string;
  deleteSelectedTablesConfirm: string;
  clearSelectionButton: string;
  selectAllTablesButton: string;
  objectsHeading: string;
  addObjectButton: string;
  objectLabelPlaceholder: string;
  objectTypeStage: string;
  objectTypeBar: string;
  objectTypeEntrance: string;
  objectTypeDanceFloor: string;
  objectTypeCustom: string;
  saveObject: string;
  deleteObjectConfirm: string;
  deleteSelectedObjectsConfirm: string;
  duplicateSuffix: string;
  alertsHeading: string;
  alertReasonNotConfirmed: string;
  alertReasonReducedCount: string;
  alertMessage: string;
  alertMessageNeedsMoreSeats: string;
  dismissAlert: string;
  lockLayoutButton: string;
  unlockLayoutButton: string;
  guestLookupHeading: string;
  guestLookupHint: string;
  guestLookupPlaceholder: string;
  guestLookupEmpty: string;
  guestLookupStatusConfirmed: string;
  guestLookupStatusDeclined: string;
  guestLookupStatusPending: string;
  guestLookupCheckInButton: string;
  guestLookupCheckedIn: string;
  guestLookupMarkAllArrived: string;
  guestLookupDecreaseArrived: string;
  guestLookupIncreaseArrived: string;
  arrivalsHeading: string;
  arrivalsToggleShow: string;
  arrivalsToggleHide: string;
  arrivalsFullyArrived: string;
  arrivalsPartiallyArrived: string;
  arrivalsNotArrived: string;
  arrivalsEmptyGroup: string;
  arrivalsFilterAll: string;
  arrivalsColumnStatus: string;
  arrivalsColumnActions: string;
  dismissAllAlertsButton: string;
  dismissAllAlertsConfirm: string;
  mapSearchPlaceholder: string;
  mapSearchEmpty: string;
  mapSearchUnseated: string;
}

type GuestListSortKey = 'name' | 'side' | 'category' | 'invitedCount' | 'status' | 'table';
type GuestListStatusFilter = 'all' | 'seated' | 'partial' | 'unseated';
type ArrivalsStatus = 'notArrived' | 'partial' | 'fullyArrived';
type ArrivalsStatusFilter = 'all' | ArrivalsStatus;

interface GuestListSortableHeaderProps {
  label: string;
  sortKey: GuestListSortKey;
  activeSort: { key: GuestListSortKey; direction: 'asc' | 'desc' };
  onSort: (key: GuestListSortKey) => void;
}

function GuestListSortableHeader({ label, sortKey, activeSort, onSort }: GuestListSortableHeaderProps) {
  const isActive = activeSort.key === sortKey;
  const SortIcon = !isActive ? ArrowUpDown : activeSort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className="px-3 py-2 text-start font-semibold" aria-sort={isActive ? (activeSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 rounded-md hover:text-gray-900 dark:hover:text-slate-100"
      >
        <span>{label}</span>
        <SortIcon size={12} aria-hidden="true" />
      </button>
    </th>
  );
}

interface SeatingSectionProps {
  confirmedEntries: GuestRosterEntry[];
  // Every roster entry regardless of status - used only by the guest status
  // lookup panel below, so anyone managing seating (including event-day
  // staff, who otherwise never see the Roster tab at all) can check whether
  // a surprise walk-in actually confirmed. Never used to populate the
  // seating pool itself - that stays confirmedEntries-only.
  allEntries: GuestRosterEntry[];
  onSetArrivedCount: (id: string, arrivedCount: number, invitedCount: number) => Promise<void>;
  tables: SeatingTable[];
  venueObjects: VenueObject[];
  assignments: SeatingAssignment[];
  alerts: SeatingAlert[];
  layoutLocked: boolean;
  onToggleLayoutLock: (locked: boolean) => Promise<void>;
  isLoading: boolean;
  locale: string;
  labels: SeatingLabels;
  onCreateTable: (name: string, seatCount: number, layout: SeatingTableLayout) => Promise<void>;
  onUpdateTable: (id: string, name: string, seatCount: number, layout: SeatingTableLayout) => Promise<void>;
  onUpdateTableLayout: (id: string, layout: SeatingTableLayout) => Promise<void>;
  onDeleteTable: (id: string) => Promise<void>;
  onCreateObject: (type: VenueObjectType, label: string, layout: SeatingTableLayout) => Promise<void>;
  onUpdateObject: (id: string, type: VenueObjectType, label: string, layout: SeatingTableLayout) => Promise<void>;
  onUpdateObjectLayout: (id: string, layout: SeatingTableLayout) => Promise<void>;
  onDeleteObject: (id: string) => Promise<void>;
  onSetAssignment: (rosterEntryId: string, tableId: string, seatsCount: number) => Promise<void>;
  onRemoveAssignment: (rosterEntryId: string, tableId: string) => Promise<void>;
  onDismissAlert: (id: string) => Promise<void>;
  // False for event-day staff - hides/disables every structural floor-plan
  // control (create/move/resize/delete a table, add/move/resize/delete a
  // venue object, lock/unlock the layout). Staff keep full read access to
  // the floor plan, guest lookup, check-in, and seating a walk-in guest at
  // an existing table - just can't touch the layout itself. Always true for
  // Gil (the admin).
  canEditLayout: boolean;
}

// Shared by every on-screen guest-name render/search/sort in this file (NOT
// the Excel export, which has its own identical-in-spirit but separately
// maintained localizeGuestName inside handleExportList - kept independent
// on purpose so a bug here can never break the already-shipped export).
// `useEnglish` mirrors the export's toggle but is driven by the dashboard's
// language switcher (SeatingSection's `locale` prop) instead of a
// dropdown: when the admin/staff view is in English, guest names shown or
// searched anywhere in the seating tab - the guest list, guest lookup,
// arrivals tracking, floor plan - use the same manually-corrected English
// spelling as the export (see englishNameOverrides.ts for Shelly's side,
// hebrewTransliteration.ts for Gil's side), never the raw Hebrew/typed
// text. Hebrew mode always shows exactly what was originally typed.
function localizedGuestNameParts(firstNameRaw: string, lastNameRaw: string, useEnglish: boolean): { firstName: string; lastName: string } {
  if (!useEnglish) return { firstName: firstNameRaw, lastName: lastNameRaw };
  const override = findEnglishNameOverride(firstNameRaw, lastNameRaw);
  if (override) return override;
  return {
    firstName: toTitleCase(transliterateHebrew(firstNameRaw)),
    lastName: toTitleCase(transliterateHebrew(lastNameRaw)),
  };
}

function entryName(entry: GuestRosterEntry, useEnglish: boolean): string {
  const { firstName, lastName } = localizedGuestNameParts(entry.firstName, entry.lastName, useEnglish);
  return `${firstName} ${lastName}`.trim() || '-';
}

const emptyTableForm = { name: '', seatCount: '8', shape: 'round' as SeatingTableShape };

// Cascades new tables across the canvas in a simple grid so they don't all
// land exactly on top of each other - Gil can then drag each one wherever it
// actually belongs.
function nextTablePosition(existingCount: number): { x: number; y: number } {
  const perRow = 8;
  const spacing = 150;
  return {
    x: 40 + (existingCount % perRow) * spacing,
    y: 40 + Math.floor(existingCount / perRow) * spacing,
  };
}

const emptyObjectForm = { type: 'stage' as VenueObjectType, label: '' };

// New objects cascade down a column on the right side of the canvas (x=1000)
// - deliberately far from where nextTablePosition places tables, since
// that's the area the venue-sketch import leaves open for the dance
// floor/bar/entrance anyway.
function nextObjectPosition(existingCount: number): { x: number; y: number } {
  return { x: 1000, y: 40 + existingCount * 110 };
}

const OBJECT_DEFAULT_SIZE: Record<VenueObjectType, { width: number; height: number; shape: SeatingTableShape }> = {
  stage: { width: 200, height: 110, shape: 'rect' },
  bar: { width: 160, height: 90, shape: 'rect' },
  entrance: { width: 120, height: 70, shape: 'rect' },
  danceFloor: { width: 220, height: 220, shape: 'round' },
  custom: { width: 140, height: 90, shape: 'rect' },
};

export function SeatingSection({
  confirmedEntries,
  allEntries,
  onSetArrivedCount,
  tables,
  venueObjects,
  assignments,
  alerts,
  layoutLocked,
  onToggleLayoutLock,
  isLoading,
  locale,
  labels,
  onCreateTable,
  onUpdateTable,
  onUpdateTableLayout,
  onDeleteTable,
  onCreateObject,
  onUpdateObject,
  onUpdateObjectLayout,
  onDeleteObject,
  onSetAssignment,
  onRemoveAssignment,
  onDismissAlert,
  canEditLayout,
}: SeatingSectionProps) {
  const [isDismissingAllAlerts, setIsDismissingAllAlerts] = useState(false);
  const [guestLookupQuery, setGuestLookupQuery] = useState('');
  const [checkInBusyId, setCheckInBusyId] = useState<string | null>(null);
  const [isArrivalsExpanded, setIsArrivalsExpanded] = useState(false);
  const [arrivalsFilter, setArrivalsFilter] = useState('');
  const [arrivalsStatusFilter, setArrivalsStatusFilter] = useState<ArrivalsStatusFilter>('all');
  const [arrivalsSort, setArrivalsSort] = useState<{ key: GuestListSortKey; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const handleArrivalsSort = (key: GuestListSortKey) => {
    setArrivalsSort((previous) => (previous.key === key ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }));
  };
  const [search, setSearch] = useState('');
  const [rowState, setRowState] = useState<Record<string, { seats: string; tableId: string }>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});

  const [isTableFormOpen, setIsTableFormOpen] = useState(false);
  const [tableForm, setTableForm] = useState(emptyTableForm);
  const [isSavingTable, setIsSavingTable] = useState(false);
  const [tableFormError, setTableFormError] = useState('');
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editTableForm, setEditTableForm] = useState(emptyTableForm);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  // Search box on the map view itself - separate from the "Unseated pool"
  // search and the "Tables > List" view's search (`listSearch`), since those
  // only filter their own text lists and never touch the canvas. Typing here
  // and clicking a result selects that guest's table exactly like clicking
  // it directly on the canvas would - same highlight ring, same detail panel
  // - so Gil/staff can find a guest by name and visually see where they sit.
  const [mapSearch, setMapSearch] = useState('');
  const [tableDeleteSelection, setTableDeleteSelection] = useState<Set<string>>(new Set());
  const [isBulkDeletingTables, setIsBulkDeletingTables] = useState(false);
  const [bulkDeleteTablesError, setBulkDeleteTablesError] = useState('');

  const [isObjectFormOpen, setIsObjectFormOpen] = useState(false);
  const [objectForm, setObjectForm] = useState(emptyObjectForm);
  const [isSavingObject, setIsSavingObject] = useState(false);
  const [objectFormError, setObjectFormError] = useState('');
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);
  const [editObjectForm, setEditObjectForm] = useState(emptyObjectForm);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [objectDeleteSelection, setObjectDeleteSelection] = useState<Set<string>>(new Set());
  const [isBulkDeletingObjects, setIsBulkDeletingObjects] = useState(false);
  const [bulkDeleteObjectsError, setBulkDeleteObjectsError] = useState('');

  const [isExportingList, setIsExportingList] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [exportError, setExportError] = useState('');
  // Guest names/categories/table names are free text Gil typed in Hebrew -
  // there's no separate English field anywhere - so "English" here means
  // best-effort transliteration (see hebrewTransliteration.ts), not a real
  // translation. Column headers/status text are real, already-written
  // English strings from i18n.ts (translations.en), independent of
  // whatever locale the dashboard itself is currently displayed in.
  const [exportLanguage, setExportLanguage] = useState<'original' | 'english'>('original');
  const floorPlanRef = useRef<SeatingFloorPlanHandle>(null);

  // Real Fullscreen API state for the map view. The element that actually
  // goes fullscreen (fullScreenContainerRef, below) wraps BOTH the canvas
  // and the sticky table-detail side panel together - not the canvas alone
  // - so clicking a table to see its seated guests keeps working exactly the
  // same while fullscreen. isFullScreen is driven off the browser's own
  // fullscreenchange event (not just the button click) so it also stays
  // correct if Gil exits with Escape instead of the button.
  const fullScreenContainerRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(document.fullscreenElement === fullScreenContainerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
  }, []);

  const handleToggleFullScreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await fullScreenContainerRef.current?.requestFullscreen();
      }
    } catch (fullScreenError) {
      console.error('Failed to toggle seating floor plan fullscreen', fullScreenError);
    }
  };


  const [tablesView, setTablesView] = useState<'map' | 'list'>('map');
  const [listSearch, setListSearch] = useState('');
  const [listTableFilter, setListTableFilter] = useState('');
  const [listStatusFilter, setListStatusFilter] = useState<GuestListStatusFilter>('all');
  const [listSort, setListSort] = useState<{ key: GuestListSortKey; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  // `locale` here is a full BCP-47 tag like "he-IL"/"fr-FR"/"en-US", not a
  // bare language code - matching it against just "he" would always be
  // false and silently force every export to render left-to-right.
  const isRtl = locale.startsWith('he');
  // Drives every on-screen guest-name display/search/sort in this file (see
  // entryName/localizedGuestNameParts above) - Gil wants staff who switch
  // the dashboard's language to English (via the toggle in AdminDashboard's
  // header) to see and search every guest by the same corrected English
  // spelling the export uses, with Hebrew mode always showing the original
  // typed names. Independent of the export's own `exportLanguage` dropdown
  // state, which stays whatever the admin last picked in that dialog.
  const isEnglishDisplay = locale.startsWith('en');
  // Dismissing an alert now sets a `dismissed` flag rather than deleting the
  // doc outright (see seating.ts's SeatingAlert/dismissSeatingAlert
  // comments), so the panel below must filter those out itself - `alerts`
  // still contains dismissed ones too, since syncSeatingAssignmentsWithRoster
  // needs the full list (dismissed included) to know whether a mismatch it's
  // about to flag was already dismissed for this exact same situation.
  const visibleAlerts = useMemo(() => alerts.filter((alert) => !alert.dismissed), [alerts]);

  const entriesById = useMemo(() => new Map(confirmedEntries.map((entry) => [entry.id, entry])), [confirmedEntries]);

  const seatsAssignedByEntry = useMemo(() => {
    const map = new Map<string, number>();
    assignments.forEach((assignment) => {
      map.set(assignment.rosterEntryId, (map.get(assignment.rosterEntryId) ?? 0) + assignment.seatsCount);
    });
    return map;
  }, [assignments]);

  const seatsUsedByTable = useMemo(() => {
    const map = new Map<string, number>();
    assignments.forEach((assignment) => {
      map.set(assignment.tableId, (map.get(assignment.tableId) ?? 0) + assignment.seatsCount);
    });
    return map;
  }, [assignments]);

  const assignmentsByTable = useMemo(() => {
    const map = new Map<string, SeatingAssignment[]>();
    assignments.forEach((assignment) => {
      const list = map.get(assignment.tableId) ?? [];
      list.push(assignment);
      map.set(assignment.tableId, list);
    });
    return map;
  }, [assignments]);

  const remainingForEntry = (entry: GuestRosterEntry): number => entry.invitedCount - (seatsAssignedByEntry.get(entry.id) ?? 0);
  const tableRemaining = (table: SeatingTable): number => table.seatCount - (seatsUsedByTable.get(table.id) ?? 0);

  const totalConfirmedPeople = useMemo(() => confirmedEntries.reduce((sum, entry) => sum + entry.invitedCount, 0), [confirmedEntries]);
  const totalSeatedPeople = useMemo(() => assignments.reduce((sum, assignment) => sum + assignment.seatsCount, 0), [assignments]);
  const totalUnseatedPeople = Math.max(0, totalConfirmedPeople - totalSeatedPeople);
  // Live day-of check-in headcount - sums each roster entry's arrivedCount
  // (which can be less than invitedCount for a party that's only partly
  // arrived), across every entry regardless of RSVP status (a surprise
  // walk-in staff let in still counts toward "how many people are here").
  // allEntries is the full live roster subscription, so this updates in
  // real time on Gil's screen the moment staff mark someone arrived.
  const totalArrivedPeople = useMemo(() => allEntries.reduce((sum, entry) => sum + entry.arrivedCount, 0), [allEntries]);
  const totalTableCapacity = useMemo(() => tables.reduce((sum, table) => sum + table.seatCount, 0), [tables]);
  const totalSeatsAvailable = Math.max(0, totalTableCapacity - totalSeatedPeople);

  const sortedTables = useMemo(() => [...tables].sort((a, b) => a.name.localeCompare(b.name, locale)), [tables, locale]);

  const tablesById = useMemo(() => new Map(tables.map((table) => [table.id, table])), [tables]);

  const assignmentsByEntry = useMemo(() => {
    const map = new Map<string, SeatingAssignment[]>();
    assignments.forEach((assignment) => {
      const list = map.get(assignment.rosterEntryId) ?? [];
      list.push(assignment);
      map.set(assignment.rosterEntryId, list);
    });
    return map;
  }, [assignments]);

  // One row per confirmed guest, for the "list view" of the tables section -
  // a searchable/filterable/sortable alternative to the floor-plan canvas,
  // for quickly answering "who's at which table" without dragging anything.
  const guestListRows = useMemo(() => {
    return confirmedEntries.map((entry) => {
      const entryAssignments = assignmentsByEntry.get(entry.id) ?? [];
      const seatsAssigned = entryAssignments.reduce((sum, assignment) => sum + assignment.seatsCount, 0);
      const remaining = entry.invitedCount - seatsAssigned;
      const status: 'seated' | 'partial' | 'unseated' = seatsAssigned <= 0 ? 'unseated' : remaining > 0 ? 'partial' : 'seated';
      const tableSummary = entryAssignments
        .map((assignment) => {
          const table = tablesById.get(assignment.tableId);
          if (!table) return null;
          const tableName = isEnglishDisplay ? transliterateHebrew(table.name) : table.name;
          return `${tableName} (${assignment.seatsCount})`;
        })
        .filter((value): value is string => value !== null)
        .join(', ');
      return { entry, name: entryName(entry, isEnglishDisplay), status, tableSummary, assignedTableIds: entryAssignments.map((a) => a.tableId) };
    });
  }, [confirmedEntries, assignmentsByEntry, tablesById, isEnglishDisplay]);

  const filteredSortedGuestListRows = useMemo(() => {
    const query = listSearch.trim().toLowerCase();
    const direction = listSort.direction === 'asc' ? 1 : -1;

    const filtered = guestListRows.filter((row) => {
      if (query && !(row.name.toLowerCase().includes(query) || row.entry.category.toLowerCase().includes(query) || row.entry.side.toLowerCase().includes(query))) {
        return false;
      }
      if (listTableFilter && !row.assignedTableIds.includes(listTableFilter)) return false;
      if (listStatusFilter !== 'all' && row.status !== listStatusFilter) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      switch (listSort.key) {
        case 'name':
          return a.name.localeCompare(b.name, locale) * direction;
        case 'side':
          return a.entry.side.localeCompare(b.entry.side, locale) * direction;
        case 'category':
          return a.entry.category.localeCompare(b.entry.category, locale) * direction;
        case 'invitedCount':
          return (a.entry.invitedCount - b.entry.invitedCount) * direction;
        case 'status':
          return a.status.localeCompare(b.status) * direction;
        case 'table':
          return a.tableSummary.localeCompare(b.tableSummary, locale) * direction;
        default:
          return 0;
      }
    });
  }, [guestListRows, listSearch, listTableFilter, listStatusFilter, listSort, locale]);

  const mapSearchResults = useMemo(() => {
    const query = mapSearch.trim().toLowerCase();
    if (!query) return [];
    return guestListRows
      .filter((row) => row.name.toLowerCase().includes(query) || row.entry.category.toLowerCase().includes(query))
      .slice(0, 8);
  }, [guestListRows, mapSearch]);

  const handleMapSearchResultClick = (row: (typeof guestListRows)[number]) => {
    const tableId = row.assignedTableIds[0] ?? null;
    setSelectedTableId(tableId);
    if (tableId) setSelectedObjectId(null);
  };

  const unseatedEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return confirmedEntries
      .filter((entry) => remainingForEntry(entry) > 0)
      .filter((entry) => {
        if (!query) return true;
        return entryName(entry, isEnglishDisplay).toLowerCase().includes(query) || entry.category.toLowerCase().includes(query);
      })
      .sort((a, b) => entryName(a, isEnglishDisplay).localeCompare(entryName(b, isEnglishDisplay), locale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedEntries, search, locale, seatsAssignedByEntry, isEnglishDisplay]);

  // "Is this surprise walk-in actually on the list?" lookup - deliberately
  // searches EVERY roster entry regardless of status (unlike the unseated
  // pool above, which is confirmed-only), so it can also surface someone who
  // declined or never responded. Only computes/renders anything once Gil (or
  // event staff) actually types something, and caps the result count, so
  // this never turns into "the entire guest list" by accident.
  const guestLookupResults = useMemo(() => {
    const query = guestLookupQuery.trim().toLowerCase();
    if (!query) return [];
    return allEntries
      .filter((entry) => entryName(entry, isEnglishDisplay).toLowerCase().includes(query) || entry.category.toLowerCase().includes(query))
      .sort((a, b) => entryName(a, isEnglishDisplay).localeCompare(entryName(b, isEnglishDisplay), locale))
      .slice(0, 15);
  }, [allEntries, guestLookupQuery, locale, isEnglishDisplay]);

  const handleArrivedCountChange = async (entry: GuestRosterEntry, nextArrivedCount: number) => {
    const clamped = Math.max(0, Math.min(nextArrivedCount, entry.invitedCount));
    if (clamped === entry.arrivedCount) return;
    setCheckInBusyId(entry.id);
    try {
      await onSetArrivedCount(entry.id, clamped, entry.invitedCount);
    } catch (checkInError) {
      console.error('Failed to update guest check-in', checkInError);
    } finally {
      setCheckInBusyId(null);
    }
  };

  // "Who's actually here" breakdown Gil asked for - every CONFIRMED guest
  // (a walk-in who was never on the RSVP list at all doesn't belong in a
  // "who's missing" list), as flat, sortable/filterable/searchable rows -
  // deliberately mirroring the Tables-List table below (same sticky-header,
  // scrollable, search+filter pattern) rather than the cramped 3-column
  // name-dump this replaced, per Gil's feedback that it needs to read like
  // a real table and stay usable with 300+ guests.
  const arrivalsRows = useMemo(() => {
    const query = arrivalsFilter.trim().toLowerCase();
    const rows = confirmedEntries
      .map((entry) => {
        const status: ArrivalsStatus = entry.arrivedCount <= 0 ? 'notArrived' : entry.arrivedCount >= entry.invitedCount ? 'fullyArrived' : 'partial';
        const tableSummary = (assignmentsByEntry.get(entry.id) ?? [])
          .map((assignment) => tablesById.get(assignment.tableId)?.name)
          .filter((name): name is string => Boolean(name))
          .map((name) => (isEnglishDisplay ? transliterateHebrew(name) : name))
          .join(', ');
        return { entry, status, tableSummary };
      })
      .filter((row) => arrivalsStatusFilter === 'all' || row.status === arrivalsStatusFilter)
      .filter((row) => !query || entryName(row.entry, isEnglishDisplay).toLowerCase().includes(query) || row.entry.category.toLowerCase().includes(query));

    const statusOrder: Record<ArrivalsStatus, number> = { notArrived: 0, partial: 1, fullyArrived: 2 };
    rows.sort((a, b) => {
      const comparison = arrivalsSort.key === 'status'
        ? statusOrder[a.status] - statusOrder[b.status] || entryName(a.entry, isEnglishDisplay).localeCompare(entryName(b.entry, isEnglishDisplay), locale)
        : entryName(a.entry, isEnglishDisplay).localeCompare(entryName(b.entry, isEnglishDisplay), locale);
      return arrivalsSort.direction === 'asc' ? comparison : -comparison;
    });
    return rows;
  }, [confirmedEntries, assignmentsByEntry, tablesById, arrivalsFilter, arrivalsStatusFilter, arrivalsSort, locale, isEnglishDisplay]);

  const getRowState = (entry: GuestRosterEntry) => {
    const remaining = remainingForEntry(entry);
    const existing = rowState[entry.id];
    if (existing) return existing;
    return { seats: String(Math.max(1, remaining)), tableId: sortedTables.find((table) => tableRemaining(table) > 0)?.id ?? '' };
  };

  const setRowField = (entryId: string, field: 'seats' | 'tableId', value: string) => {
    setRowState((prev) => ({
      ...prev,
      [entryId]: { ...(prev[entryId] ?? getRowState(entriesById.get(entryId)!)), [field]: value },
    }));
  };

  const handleAddToTable = async (entry: GuestRosterEntry) => {
    const state = getRowState(entry);
    if (!state.tableId) return;
    const table = tables.find((candidate) => candidate.id === state.tableId);
    if (!table) return;

    const remaining = remainingForEntry(entry);
    const parsedSeats = Number.parseInt(state.seats, 10);
    const requestedSeats = Number.isFinite(parsedSeats) && parsedSeats > 0 ? parsedSeats : remaining;
    const capacityLeft = tableRemaining(table);
    const seatsToAdd = Math.min(requestedSeats, remaining, Math.max(capacityLeft, 0));
    if (seatsToAdd <= 0) return;

    const existingAtTable = assignments.find((assignment) => assignment.rosterEntryId === entry.id && assignment.tableId === table.id)?.seatsCount ?? 0;

    const key = `add-${entry.id}`;
    setBusyKey(key);
    setErrorByKey((prev) => ({ ...prev, [key]: '' }));
    try {
      await onSetAssignment(entry.id, table.id, existingAtTable + seatsToAdd);
      setRowState((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
    } catch (error) {
      console.error('Failed to assign guest to table', error);
      setErrorByKey((prev) => ({ ...prev, [key]: labels.updateError }));
    } finally {
      setBusyKey(null);
    }
  };

  const handleAssignmentSeatsChange = async (assignment: SeatingAssignment, value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed === assignment.seatsCount) return;

    const entry = entriesById.get(assignment.rosterEntryId);
    const table = tables.find((candidate) => candidate.id === assignment.tableId);
    if (!entry || !table) return;

    const otherSeatsForEntry = (seatsAssignedByEntry.get(entry.id) ?? 0) - assignment.seatsCount;
    const otherSeatsForTable = (seatsUsedByTable.get(table.id) ?? 0) - assignment.seatsCount;
    const maxAllowed = Math.min(entry.invitedCount - otherSeatsForEntry, table.seatCount - otherSeatsForTable);
    const nextSeats = Math.max(0, Math.min(parsed, maxAllowed));

    const key = `assignment-${assignment.id}`;
    setBusyKey(key);
    setErrorByKey((prev) => ({ ...prev, [key]: '' }));
    try {
      await onSetAssignment(assignment.rosterEntryId, assignment.tableId, nextSeats);
    } catch (error) {
      console.error('Failed to update seating assignment', error);
      setErrorByKey((prev) => ({ ...prev, [key]: labels.updateError }));
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemoveAssignment = async (assignment: SeatingAssignment) => {
    const key = `assignment-${assignment.id}`;
    setBusyKey(key);
    setErrorByKey((prev) => ({ ...prev, [key]: '' }));
    try {
      await onRemoveAssignment(assignment.rosterEntryId, assignment.tableId);
    } catch (error) {
      console.error('Failed to remove seating assignment', error);
      setErrorByKey((prev) => ({ ...prev, [key]: labels.deleteError }));
    } finally {
      setBusyKey(null);
    }
  };

  const handleCreateTableSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTableFormError('');
    if (!tableForm.name.trim()) {
      setTableFormError(labels.createError);
      return;
    }
    const seatCount = Number.parseInt(tableForm.seatCount, 10);
    setIsSavingTable(true);
    try {
      const position = nextTablePosition(tables.length);
      // Square-ish for 'teardrop' so rotating it 90 degrees later never looks
      // squashed - see the rotation comment on SeatingTableLayout.
      const size = tableForm.shape === 'round'
        ? { width: 110, height: 110 }
        : tableForm.shape === 'teardrop'
          ? { width: 140, height: 140 }
          : tableForm.shape === 'curved'
            ? { width: 250, height: 120 }
            : { width: 150, height: 90 };
      await onCreateTable(tableForm.name.trim(), Number.isFinite(seatCount) && seatCount > 0 ? seatCount : 8, {
        ...position,
        ...size,
        shape: tableForm.shape,
      });
      setTableForm(emptyTableForm);
      setIsTableFormOpen(false);
    } catch (error) {
      console.error('Failed to create table', error);
      setTableFormError(labels.createError);
    } finally {
      setIsSavingTable(false);
    }
  };

  const startEditingTable = (table: SeatingTable) => {
    setEditingTableId(table.id);
    setEditTableForm({ name: table.name, seatCount: String(table.seatCount), shape: table.shape });
  };

  const handleSaveTableEdit = async (table: SeatingTable) => {
    const seatCount = Number.parseInt(editTableForm.seatCount, 10);
    const key = `table-${table.id}`;
    setBusyKey(key);
    setErrorByKey((prev) => ({ ...prev, [key]: '' }));
    try {
      await onUpdateTable(table.id, editTableForm.name.trim() || labels.tableNamePlaceholder, Number.isFinite(seatCount) && seatCount > 0 ? seatCount : 1, {
        x: table.x,
        y: table.y,
        width: table.width,
        height: table.height,
        shape: editTableForm.shape,
        rotation: table.rotation,
      });
      setEditingTableId(null);
    } catch (error) {
      console.error('Failed to update table', error);
      setErrorByKey((prev) => ({ ...prev, [key]: labels.updateError }));
    } finally {
      setBusyKey(null);
    }
  };

  // Only ever touches the decorative shape's facing direction - x/y/width/
  // height/name/seatCount all stay exactly as they were - so Gil can orient
  // a teardrop or curved booth to match the hall without re-entering
  // anything else about the table.
  const handleRotateTable = async (table: SeatingTable) => {
    const key = `table-${table.id}`;
    setBusyKey(key);
    setErrorByKey((prev) => ({ ...prev, [key]: '' }));
    try {
      await onUpdateTable(table.id, table.name, table.seatCount, {
        x: table.x,
        y: table.y,
        width: table.width,
        height: table.height,
        shape: table.shape,
        rotation: (table.rotation + 90) % 360,
      });
    } catch (error) {
      console.error('Failed to rotate table', error);
      setErrorByKey((prev) => ({ ...prev, [key]: labels.updateError }));
    } finally {
      setBusyKey(null);
    }
  };

  const handleLayoutChange = (tableId: string, layout: SeatingTableLayout) => {
    onUpdateTableLayout(tableId, layout).catch((error) => {
      console.error('Failed to update table layout', error);
    });
  };

  const handleDeleteTable = async (table: SeatingTable) => {
    if (typeof window !== 'undefined' && !window.confirm(labels.deleteTableConfirm)) return;
    const key = `table-${table.id}`;
    setBusyKey(key);
    try {
      await onDeleteTable(table.id);
    } catch (error) {
      console.error('Failed to delete table', error);
      setErrorByKey((prev) => ({ ...prev, [key]: labels.deleteError }));
    } finally {
      setBusyKey(null);
    }
  };

  const handleExportList = async () => {
    setIsExportingList(true);
    setExportError('');
    try {
      const useEnglish = exportLanguage === 'english';
      // Guest names/categories/table names are free text Gil typed in
      // Hebrew - localizeName runs them through the best-effort
      // transliteration when English is selected, and leaves them exactly
      // as-is (whatever script the dashboard's current locale is in)
      // otherwise. Column headers/status words below are real, already-
      // written English strings from translations.en - not transliterated.
      const localizeName = (value: string) => (useEnglish ? transliterateHebrew(value) : value);
      // Guest first/last names specifically (not category/table/side, which
      // stay on the plain transliterator above) get one more pass in
      // English mode: an exact manual correction from Shelly's own seating
      // list when one exists (see englishNameOverrides.ts - e.g. "Elkaim"
      // typed in the roster becomes the family's real spelling "Elkayam"),
      // otherwise just professional title-casing of whatever's already
      // there. Only ever affects this export - guestRoster itself is never
      // touched.
      const localizeGuestName = (firstNameRaw: string, lastNameRaw: string): { firstName: string; lastName: string } => {
        if (!useEnglish) return { firstName: firstNameRaw, lastName: lastNameRaw };
        const override = findEnglishNameOverride(firstNameRaw, lastNameRaw);
        if (override) return override;
        return {
          firstName: toTitleCase(transliterateHebrew(firstNameRaw)),
          lastName: toTitleCase(transliterateHebrew(lastNameRaw)),
        };
      };
      // Sorts by last name first, then first name - Gil wants the export
      // ordered the way a printed seating/name-card list normally is (by
      // family name), not by first name.
      const byLastThenFirstName = (a: { firstName: string; lastName: string }, b: { firstName: string; lastName: string }) =>
        a.lastName.localeCompare(b.lastName, locale) || a.firstName.localeCompare(b.firstName, locale);
      const en = translations.en;
      const exportLabels = useEnglish
        ? {
            tablesSheet: en.adminSeatingTablesHeading,
            unseatedSheet: en.adminSeatingUnseatedHeading,
            fullListSheet: en.adminSeatingFullListSheet,
            firstNameColumn: en.adminRosterFirstName,
            lastNameColumn: en.adminRosterLastName,
            categoryColumn: en.adminSeatingExportCategoryColumn,
            guestSeatsColumn: en.adminSeatingExportSeatsColumn,
            remainingColumn: en.adminSeatingExportRemainingColumn,
            tableFullBadge: en.adminSeatingTableFullBadge,
            occupiedLabel: en.adminSeatingExportOccupiedLabel,
            listColumnSide: en.adminSeatingListColumnSide,
            listColumnCategory: en.adminSeatingListColumnCategory,
            listColumnInvited: en.adminSeatingListColumnInvited,
            listColumnStatus: en.adminSeatingListColumnStatus,
            listColumnTables: en.adminSeatingListColumnTables,
          }
        : {
            tablesSheet: labels.tablesHeading,
            unseatedSheet: labels.unseatedHeading,
            fullListSheet: labels.fullListSheet,
            firstNameColumn: labels.rosterFirstName,
            lastNameColumn: labels.rosterLastName,
            categoryColumn: labels.exportCategoryColumn,
            guestSeatsColumn: labels.exportSeatsColumn,
            remainingColumn: labels.exportRemainingColumn,
            tableFullBadge: labels.tableFullBadge,
            occupiedLabel: labels.exportOccupiedLabel,
            listColumnSide: labels.listColumnSide,
            listColumnCategory: labels.listColumnCategory,
            listColumnInvited: labels.listColumnInvited,
            listColumnStatus: labels.listColumnStatus,
            listColumnTables: labels.listColumnTables,
          };

      const statusLabelFor = (status: 'seated' | 'partial' | 'unseated') => {
        if (status === 'seated') return useEnglish ? en.adminSeatingListStatusFilterSeated : labels.listStatusFilterSeated;
        if (status === 'partial') return useEnglish ? en.adminSeatingListStatusFilterPartial : labels.listStatusFilterPartial;
        return useEnglish ? en.adminSeatingListStatusFilterUnseated : labels.listStatusFilterUnseated;
      };

      const exportTables: SeatingExportTable[] = sortedTables.map((table) => {
        const tableAssignments = assignmentsByTable.get(table.id) ?? [];
        const guests: SeatingExportGuest[] = tableAssignments
          .map((assignment) => {
            const entry = entriesById.get(assignment.rosterEntryId);
            if (!entry) return null;
            const { firstName, lastName } = localizeGuestName(entry.firstName, entry.lastName);
            return {
              firstName,
              lastName,
              category: localizeName(entry.category),
              seats: assignment.seatsCount,
            };
          })
          .filter((guest): guest is SeatingExportGuest => guest !== null)
          .sort(byLastThenFirstName);
        const used = seatsUsedByTable.get(table.id) ?? 0;
        return {
          name: localizeName(table.name),
          occupiedText: exportLabels.occupiedLabel.replace('{used}', String(used)).replace('{total}', String(table.seatCount)),
          isFull: used >= table.seatCount,
          guests,
        };
      });

      const unseatedExport: SeatingExportUnseatedGuest[] = confirmedEntries
        .filter((entry) => remainingForEntry(entry) > 0)
        .map((entry) => {
          const { firstName, lastName } = localizeGuestName(entry.firstName, entry.lastName);
          return {
            firstName,
            lastName,
            category: localizeName(entry.category),
            remaining: remainingForEntry(entry),
          };
        })
        .sort(byLastThenFirstName);

      const fullListExport: SeatingExportListRow[] = [...guestListRows]
        .sort((a, b) => byLastThenFirstName(a.entry, b.entry))
        .map((row) => {
          const { firstName, lastName } = localizeGuestName(row.entry.firstName, row.entry.lastName);
          return {
            firstName,
            lastName,
            side: localizeName(row.entry.side),
            category: localizeName(row.entry.category),
            invitedCount: row.entry.invitedCount,
            statusText: statusLabelFor(row.status),
            tableSummary: localizeName(row.tableSummary) || '-',
          };
        });

      await exportSeatingChart({
        tables: exportTables,
        unseated: unseatedExport,
        fullList: fullListExport,
        labels: exportLabels,
        isRtl: useEnglish ? false : isRtl,
      });
    } catch (error) {
      console.error('Failed to export seating chart list', error);
      setExportError(labels.exportError);
    } finally {
      setIsExportingList(false);
    }
  };

  const handleExportImage = async () => {
    setIsExportingImage(true);
    setExportError('');
    try {
      await floorPlanRef.current?.exportImage(`seating-layout-${new Date().toISOString().slice(0, 10)}.png`);
    } catch (error) {
      console.error('Failed to export seating layout image', error);
      setExportError(labels.exportError);
    } finally {
      setIsExportingImage(false);
    }
  };

  const toggleTableDeleteSelection = (id: string) => {
    setTableDeleteSelection((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDeleteTables = async () => {
    if (tableDeleteSelection.size === 0) return;
    const confirmMessage = labels.deleteSelectedTablesConfirm.replace('{count}', String(tableDeleteSelection.size));
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) return;
    setIsBulkDeletingTables(true);
    setBulkDeleteTablesError('');
    try {
      await Promise.all(Array.from(tableDeleteSelection).map((id) => onDeleteTable(id)));
      setTableDeleteSelection(new Set());
    } catch (error) {
      console.error('Failed to bulk-delete tables', error);
      setBulkDeleteTablesError(labels.deleteError);
    } finally {
      setIsBulkDeletingTables(false);
    }
  };

  const handleCreateObjectSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setObjectFormError('');
    if (!objectForm.label.trim()) {
      setObjectFormError(labels.createError);
      return;
    }
    setIsSavingObject(true);
    try {
      const position = nextObjectPosition(venueObjects.length);
      const size = OBJECT_DEFAULT_SIZE[objectForm.type];
      await onCreateObject(objectForm.type, objectForm.label.trim(), { ...position, ...size });
      setObjectForm(emptyObjectForm);
      setIsObjectFormOpen(false);
    } catch (error) {
      console.error('Failed to create venue object', error);
      setObjectFormError(labels.createError);
    } finally {
      setIsSavingObject(false);
    }
  };

  const startEditingObject = (object: VenueObject) => {
    setEditingObjectId(object.id);
    setEditObjectForm({ type: object.type, label: object.label });
  };

  const handleSaveObjectEdit = async (object: VenueObject) => {
    const key = `object-${object.id}`;
    setBusyKey(key);
    setErrorByKey((prev) => ({ ...prev, [key]: '' }));
    try {
      await onUpdateObject(object.id, editObjectForm.type, editObjectForm.label.trim() || object.label, {
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        shape: object.shape,
      });
      setEditingObjectId(null);
    } catch (error) {
      console.error('Failed to update venue object', error);
      setErrorByKey((prev) => ({ ...prev, [key]: labels.updateError }));
    } finally {
      setBusyKey(null);
    }
  };

  const handleObjectLayoutChange = (objectId: string, layout: SeatingTableLayout) => {
    onUpdateObjectLayout(objectId, layout).catch((error) => {
      console.error('Failed to update venue object layout', error);
    });
  };

  const handleDeleteObject = async (object: VenueObject) => {
    if (typeof window !== 'undefined' && !window.confirm(labels.deleteObjectConfirm)) return;
    const key = `object-${object.id}`;
    setBusyKey(key);
    try {
      await onDeleteObject(object.id);
      if (selectedObjectId === object.id) setSelectedObjectId(null);
    } catch (error) {
      console.error('Failed to delete venue object', error);
      setErrorByKey((prev) => ({ ...prev, [key]: labels.deleteError }));
    } finally {
      setBusyKey(null);
    }
  };

  const toggleObjectDeleteSelection = (id: string) => {
    setObjectDeleteSelection((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDeleteObjects = async () => {
    if (objectDeleteSelection.size === 0) return;
    const confirmMessage = labels.deleteSelectedObjectsConfirm.replace('{count}', String(objectDeleteSelection.size));
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) return;
    setIsBulkDeletingObjects(true);
    setBulkDeleteObjectsError('');
    try {
      await Promise.all(Array.from(objectDeleteSelection).map((id) => onDeleteObject(id)));
      setObjectDeleteSelection(new Set());
      setSelectedObjectId(null);
    } catch (error) {
      console.error('Failed to bulk-delete venue objects', error);
      setBulkDeleteObjectsError(labels.deleteError);
    } finally {
      setIsBulkDeletingObjects(false);
    }
  };

  // Ctrl+V duplicate handlers - SeatingFloorPlan already computed the offset
  // layout (clamped to canvas bounds), this just persists a new
  // table/object with that layout and a name/label that makes clear it's a
  // copy, so Gil isn't left with two identically-named items on the canvas.
  const handleDuplicateTable = (table: SeatingTable, layout: SeatingTableLayout) => {
    onCreateTable(`${table.name}${labels.duplicateSuffix}`, table.seatCount, layout).catch((error) => {
      console.error('Failed to duplicate table', error);
    });
  };

  const handleDuplicateObject = (object: VenueObject, layout: SeatingTableLayout) => {
    onCreateObject(object.type, `${object.label}${labels.duplicateSuffix}`, layout).catch((error) => {
      console.error('Failed to duplicate venue object', error);
    });
  };

  const handleDismissAlert = async (alert: SeatingAlert) => {
    const key = `alert-${alert.id}`;
    setBusyKey(key);
    try {
      await onDismissAlert(alert.id);
    } catch (error) {
      console.error('Failed to dismiss seating alert', error);
      setErrorByKey((prev) => ({ ...prev, [key]: labels.deleteError }));
    } finally {
      setBusyKey(null);
    }
  };

  const handleDismissAllAlerts = async () => {
    if (typeof window !== 'undefined' && !window.confirm(labels.dismissAllAlertsConfirm)) return;
    setIsDismissingAllAlerts(true);
    try {
      // Sequential, not Promise.all - keeps this identical in spirit to
      // clicking each alert's own dismiss button one at a time, just
      // without needing 100+ individual clicks.
      for (const alert of alerts) {
        // eslint-disable-next-line no-await-in-loop
        await onDismissAlert(alert.id);
      }
    } catch (error) {
      console.error('Failed to dismiss all seating alerts', error);
    } finally {
      setIsDismissingAllAlerts(false);
    }
  };

  const handleToggleLayoutLock = () => {
    onToggleLayoutLock(!layoutLocked).catch((error) => {
      console.error('Failed to toggle seating layout lock', error);
    });
  };

  const handleGuestListSort = (key: GuestListSortKey) => {
    setListSort((previous) => (previous.key === key ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }));
  };

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95">
        <div className="flex items-center justify-center gap-3 p-8 text-gray-600 dark:text-slate-400">
          <span className="h-5 w-5 rounded-full border-2 border-gray-200 border-t-gray-700 animate-spin dark:border-slate-700 dark:border-t-slate-300" />
          <span>{labels.loading}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-slate-700">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{labels.title}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-slate-300">
            {labels.exportLanguageLabel}
            <select
              value={exportLanguage}
              onChange={(event) => setExportLanguage(event.target.value === 'english' ? 'english' : 'original')}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-slate-700"
            >
              <option value="original">{labels.exportLanguageOriginal}</option>
              <option value="english">{labels.exportLanguageEnglish}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={handleExportList}
            disabled={isExportingList || tables.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {isExportingList ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {labels.exportListButton}
          </button>
          <button
            type="button"
            onClick={handleExportImage}
            disabled={isExportingImage || tables.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {isExportingImage ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            {labels.exportImageButton}
          </button>
        </div>
        {exportError && <p className="w-full text-xs text-rose-600 dark:text-rose-400">{exportError}</p>}
      </div>

      <div className="space-y-6 p-5">
        {/* Seating alerts - auto-generated whenever a seated guest's confirmed
            status/headcount changed enough that some of their seats had to
            be freed automatically (see syncSeatingAssignmentsWithRoster).
            Dismissed by deleting, one at a time, once Gil has seen it. */}
        {alerts.length > 0 && (
          <div className="space-y-1.5 rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle size={15} aria-hidden="true" />
                {labels.alertsHeading} ({alerts.length})
              </h3>
              <button
                type="button"
                onClick={handleDismissAllAlerts}
                disabled={isDismissingAllAlerts}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-slate-800 dark:text-amber-300 dark:hover:bg-slate-700"
              >
                {isDismissingAllAlerts ? <Loader2 size={12} className="animate-spin" /> : null}
                {labels.dismissAllAlertsButton}
              </button>
            </div>
            <div className="space-y-1">
              {alerts.map((alert) => {
                const alertKey = `alert-${alert.id}`;
                const message = alert.reason === 'needsMoreSeats'
                  ? labels.alertMessageNeedsMoreSeats
                    .replace('{name}', alert.guestName)
                    .replace('{category}', alert.category)
                    .replace('{table}', alert.tableName)
                    .replace('{seats}', String(alert.seatsCount))
                  : labels.alertMessage
                    .replace('{name}', alert.guestName)
                    .replace('{table}', alert.tableName)
                    .replace('{seats}', String(alert.seatsCount))
                    .replace('{reason}', alert.reason === 'reducedCount' ? labels.alertReasonReducedCount : labels.alertReasonNotConfirmed);
                return (
                  <div key={alert.id} className="flex items-start justify-between gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm text-amber-900 dark:bg-slate-900/40 dark:text-amber-200">
                    <span className="min-w-0 flex-1">{message}</span>
                    <button
                      type="button"
                      onClick={() => handleDismissAlert(alert)}
                      disabled={busyKey === alertKey}
                      title={labels.dismissAlert}
                      aria-label={labels.dismissAlert}
                      className="shrink-0 rounded-lg p-1 text-amber-500 hover:bg-amber-100 disabled:opacity-60 dark:text-amber-400 dark:hover:bg-amber-900/40"
                    >
                      {busyKey === alertKey ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Guest status lookup - answers "is this surprise walk-in actually
            on the list?" against the FULL roster (confirmed, declined, or
            never responded), not just the confirmed/seatable pool below.
            Especially useful for event-day seating staff, who never see the
            Roster tab at all. */}
        <div>
          <h3 className="mb-0.5 text-sm font-semibold text-gray-700 dark:text-slate-300">{labels.guestLookupHeading}</h3>
          <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">{labels.guestLookupHint}</p>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 rtl:right-3 ltr:left-3" />
            <input
              type="text"
              value={guestLookupQuery}
              onChange={(event) => setGuestLookupQuery(event.target.value)}
              placeholder={labels.guestLookupPlaceholder}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700 rtl:pr-9 ltr:pl-9"
            />
          </div>
          {guestLookupQuery.trim() && (
            guestLookupResults.length === 0 ? (
              <p className="mt-2 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">{labels.guestLookupEmpty}</p>
            ) : (
              <div className="mt-2 max-h-96 divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-100 dark:divide-slate-700 dark:border-slate-700">
                {guestLookupResults.map((entry) => {
                  const badge = entry.knownResponse === 'yes'
                    ? { text: labels.guestLookupStatusConfirmed, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' }
                    : entry.knownResponse === 'no'
                      ? { text: labels.guestLookupStatusDeclined, className: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' }
                      : { text: labels.guestLookupStatusPending, className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' };
                  const entryTableSummary = (assignmentsByEntry.get(entry.id) ?? [])
                    .map((assignment) => tablesById.get(assignment.tableId)?.name)
                    .filter((name): name is string => Boolean(name))
                    .join(', ');
                  const isCheckInBusy = checkInBusyId === entry.id;
                  const isMultiParty = entry.invitedCount > 1;
                  const isFullyArrived = entry.arrivedCount >= entry.invitedCount && entry.invitedCount > 0;
                  return (
                    <div key={entry.id} className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-gray-900 dark:text-slate-100">{entryName(entry, isEnglishDisplay)}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.text}</span>
                          <span className="text-sm text-gray-600 dark:text-slate-300">{entry.category}</span>
                          {entryTableSummary ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-sm font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                              <MapIcon size={13} aria-hidden="true" /> {entryTableSummary}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-slate-500">{labels.mapSearchUnseated}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {isMultiParty && (
                          <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-1.5 py-1 dark:border-slate-600 dark:bg-slate-800">
                            <button
                              type="button"
                              onClick={() => handleArrivedCountChange(entry, entry.arrivedCount - 1)}
                              disabled={isCheckInBusy || entry.arrivedCount <= 0}
                              aria-label={labels.guestLookupDecreaseArrived}
                              className="px-2 py-0.5 text-base leading-none text-gray-500 hover:text-gray-800 disabled:opacity-30 dark:text-slate-400 dark:hover:text-slate-100"
                            >
                              −
                            </button>
                            <span className="min-w-[2.75rem] text-center text-sm font-semibold text-gray-700 dark:text-slate-200">
                              {entry.arrivedCount}/{entry.invitedCount}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleArrivedCountChange(entry, entry.arrivedCount + 1)}
                              disabled={isCheckInBusy || entry.arrivedCount >= entry.invitedCount}
                              aria-label={labels.guestLookupIncreaseArrived}
                              className="px-2 py-0.5 text-base leading-none text-gray-500 hover:text-gray-800 disabled:opacity-30 dark:text-slate-400 dark:hover:text-slate-100"
                            >
                              +
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleArrivedCountChange(entry, isFullyArrived ? 0 : entry.invitedCount)}
                          disabled={isCheckInBusy}
                          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 sm:flex-none ${
                            isFullyArrived
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          {isCheckInBusy ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : isFullyArrived ? (
                            <UserCheck size={14} />
                          ) : null}
                          {isFullyArrived ? labels.guestLookupCheckedIn : (isMultiParty ? labels.guestLookupMarkAllArrived : labels.guestLookupCheckInButton)}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Arrivals tracking - who's here, who's not, who's only partly
            here, across every CONFIRMED guest. Rebuilt as a proper sortable/
            filterable table (mirroring the Tables-List table below) after
            Gil found the original 3-column name-dump cramped and hard to
            read with 300+ guests. Collapsed by default - only expands on
            request. */}
        <div className="rounded-2xl border border-gray-100 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setIsArrivalsExpanded((previous) => !previous)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start"
          >
            <span className="text-base font-semibold text-gray-700 dark:text-slate-300">
              {labels.arrivalsHeading} ({totalArrivedPeople}/{totalConfirmedPeople})
            </span>
            <span className="text-sm font-medium text-gray-500 dark:text-slate-400">
              {isArrivalsExpanded ? labels.arrivalsToggleHide : labels.arrivalsToggleShow}
            </span>
          </button>
          {isArrivalsExpanded && (
            <div className="border-t border-gray-100 p-4 dark:border-slate-700">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search size={14} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 ${isRtl ? 'right-3' : 'left-3'}`} />
                  <input
                    type="text"
                    value={arrivalsFilter}
                    onChange={(event) => setArrivalsFilter(event.target.value)}
                    placeholder={labels.guestLookupPlaceholder}
                    className={`w-full rounded-xl border border-gray-200 bg-white py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700 ${isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
                  />
                </div>
                <select
                  value={arrivalsStatusFilter}
                  onChange={(event) => setArrivalsStatusFilter(event.target.value as ArrivalsStatusFilter)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                >
                  <option value="all">{labels.arrivalsFilterAll}</option>
                  <option value="notArrived">{labels.arrivalsNotArrived}</option>
                  <option value="partial">{labels.arrivalsPartiallyArrived}</option>
                  <option value="fullyArrived">{labels.arrivalsFullyArrived}</option>
                </select>
              </div>

              {arrivalsRows.length === 0 ? (
                <p className="rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-3 text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">{labels.arrivalsEmptyGroup}</p>
              ) : (
                <>
                  {/* Phone layout - a real <table> only ever fits on a phone
                      screen by shrinking columns illegibly or forcing
                      constant left-right scrolling to see the rest of the
                      row, which is exactly what Gil ran into. Below sm, this
                      renders instead: one self-contained card per guest,
                      full width, everything readable without scrolling
                      sideways at all. */}
                  <div className="max-h-[480px] space-y-2 overflow-y-auto sm:hidden">
                    {arrivalsRows.map(({ entry, status, tableSummary }) => {
                      const isCheckInBusy = checkInBusyId === entry.id;
                      const isMultiParty = entry.invitedCount > 1;
                      const statusBadge = status === 'fullyArrived'
                        ? { text: labels.arrivalsFullyArrived, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' }
                        : status === 'partial'
                          ? { text: labels.arrivalsPartiallyArrived, className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' }
                          : { text: labels.arrivalsNotArrived, className: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300' };
                      return (
                        <div key={entry.id} className="rounded-2xl border border-gray-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{entryName(entry, isEnglishDisplay)}</p>
                            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}>
                              {statusBadge.text}
                              {isMultiParty && <span dir="ltr">({entry.arrivedCount}/{entry.invitedCount})</span>}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            <span className="text-gray-500 dark:text-slate-400">{entry.category}</span>
                            {tableSummary ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                                <MapIcon size={11} aria-hidden="true" /> {tableSummary}
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-slate-500">{labels.mapSearchUnseated}</span>
                            )}
                          </div>
                          <div className="mt-2 flex items-center gap-1.5">
                            {isMultiParty && (
                              <div className="flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1 dark:border-slate-600 dark:bg-slate-800">
                                <button
                                  type="button"
                                  onClick={() => handleArrivedCountChange(entry, entry.arrivedCount - 1)}
                                  disabled={isCheckInBusy || entry.arrivedCount <= 0}
                                  aria-label={labels.guestLookupDecreaseArrived}
                                  className="px-2 py-0.5 text-base leading-none text-gray-500 hover:text-gray-800 disabled:opacity-30 dark:text-slate-400 dark:hover:text-slate-100"
                                >
                                  −
                                </button>
                                <span className="min-w-[2.5rem] text-center text-xs font-semibold text-gray-700 dark:text-slate-200">
                                  {entry.arrivedCount}/{entry.invitedCount}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleArrivedCountChange(entry, entry.arrivedCount + 1)}
                                  disabled={isCheckInBusy || entry.arrivedCount >= entry.invitedCount}
                                  aria-label={labels.guestLookupIncreaseArrived}
                                  className="px-2 py-0.5 text-base leading-none text-gray-500 hover:text-gray-800 disabled:opacity-30 dark:text-slate-400 dark:hover:text-slate-100"
                                >
                                  +
                                </button>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => handleArrivedCountChange(entry, status === 'fullyArrived' ? 0 : entry.invitedCount)}
                              disabled={isCheckInBusy}
                              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                                status === 'fullyArrived'
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                              }`}
                            >
                              {isCheckInBusy ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : status === 'fullyArrived' ? (
                                <UserCheck size={13} />
                              ) : null}
                              {status === 'fullyArrived' ? labels.guestLookupCheckedIn : (isMultiParty ? labels.guestLookupMarkAllArrived : labels.guestLookupCheckInButton)}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Tablet/desktop layout - the real sortable table. */}
                  <div className="hidden max-h-[480px] overflow-auto rounded-2xl border border-gray-100 dark:border-slate-700 sm:block">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 dark:bg-slate-800/90 dark:text-slate-400">
                        <tr>
                          <GuestListSortableHeader label={labels.listColumnName} sortKey="name" activeSort={arrivalsSort} onSort={handleArrivalsSort} />
                          <th className="px-3 py-2 text-start font-semibold">{labels.listColumnCategory}</th>
                          <th className="px-3 py-2 text-start font-semibold">{labels.listColumnTables}</th>
                          <GuestListSortableHeader label={labels.arrivalsColumnStatus} sortKey="status" activeSort={arrivalsSort} onSort={handleArrivalsSort} />
                          <th className="px-3 py-2 text-start font-semibold">{labels.arrivalsColumnActions}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white dark:divide-slate-700 dark:bg-slate-900">
                        {arrivalsRows.map(({ entry, status, tableSummary }) => {
                          const isCheckInBusy = checkInBusyId === entry.id;
                          const isMultiParty = entry.invitedCount > 1;
                          const statusBadge = status === 'fullyArrived'
                            ? { text: labels.arrivalsFullyArrived, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' }
                            : status === 'partial'
                              ? { text: labels.arrivalsPartiallyArrived, className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' }
                              : { text: labels.arrivalsNotArrived, className: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300' };
                          return (
                            <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                              <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-slate-100">{entryName(entry, isEnglishDisplay)}</td>
                              <td className="px-3 py-2.5 text-gray-600 dark:text-slate-400">{entry.category}</td>
                              <td className="px-3 py-2.5 text-gray-600 dark:text-slate-400">
                                {tableSummary ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                                    <MapIcon size={11} aria-hidden="true" /> {tableSummary}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 dark:text-slate-500">{labels.mapSearchUnseated}</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}>
                                  {statusBadge.text}
                                  {isMultiParty && <span dir="ltr">({entry.arrivedCount}/{entry.invitedCount})</span>}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  {isMultiParty && (
                                    <div className="flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1 dark:border-slate-600 dark:bg-slate-800">
                                      <button
                                        type="button"
                                        onClick={() => handleArrivedCountChange(entry, entry.arrivedCount - 1)}
                                        disabled={isCheckInBusy || entry.arrivedCount <= 0}
                                        aria-label={labels.guestLookupDecreaseArrived}
                                        className="px-1.5 text-sm leading-none text-gray-500 hover:text-gray-800 disabled:opacity-30 dark:text-slate-400 dark:hover:text-slate-100"
                                      >
                                        −
                                      </button>
                                      <span className="min-w-[2.25rem] text-center text-xs font-semibold text-gray-700 dark:text-slate-200">
                                        {entry.arrivedCount}/{entry.invitedCount}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleArrivedCountChange(entry, entry.arrivedCount + 1)}
                                        disabled={isCheckInBusy || entry.arrivedCount >= entry.invitedCount}
                                        aria-label={labels.guestLookupIncreaseArrived}
                                        className="px-1.5 text-sm leading-none text-gray-500 hover:text-gray-800 disabled:opacity-30 dark:text-slate-400 dark:hover:text-slate-100"
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleArrivedCountChange(entry, status === 'fullyArrived' ? 0 : entry.invitedCount)}
                                    disabled={isCheckInBusy}
                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                                      status === 'fullyArrived'
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                        : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                                    }`}
                                  >
                                    {isCheckInBusy ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : status === 'fullyArrived' ? (
                                      <UserCheck size={12} />
                                    ) : null}
                                    {status === 'fullyArrived' ? labels.guestLookupCheckedIn : (isMultiParty ? labels.guestLookupMarkAllArrived : labels.guestLookupCheckInButton)}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/40 dark:text-violet-300">
            <UserCheck size={20} className="opacity-80" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-70">{labels.statArrived}</p>
            <p className="mt-1 text-3xl font-semibold">{totalArrivedPeople} <span className="text-base font-normal opacity-70">/ {totalConfirmedPeople}</span></p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300">
            <Users size={20} className="opacity-80" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-70">{labels.statConfirmed}</p>
            <p className="mt-1 text-3xl font-semibold">{totalConfirmedPeople}</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300">
            <UserCheck size={20} className="opacity-80" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-70">{labels.statSeated}</p>
            <p className="mt-1 text-3xl font-semibold">{totalSeatedPeople}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300">
            <Users size={20} className="opacity-80" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-70">{labels.statUnseated}</p>
            <p className="mt-1 text-3xl font-semibold">{totalUnseatedPeople}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <LayoutGrid size={20} className="opacity-80" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-70">{labels.statTables}</p>
            <p className="mt-1 text-3xl font-semibold">{tables.length}</p>
            <p className="text-xs opacity-70">{totalSeatsAvailable} {labels.statSeatsAvailable}</p>
          </div>
        </div>

        {/* Unseated pool */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-slate-300">{labels.unseatedHeading} ({unseatedEntries.length})</h3>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="mb-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
          />
          {unseatedEntries.length === 0 ? (
            <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300">{labels.unseatedAllSeated}</p>
          ) : (
            <div className="max-h-96 divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-100 dark:divide-slate-700 dark:border-slate-700">
              {unseatedEntries.map((entry) => {
                const remaining = remainingForEntry(entry);
                const state = getRowState(entry);
                const key = `add-${entry.id}`;
                const isBusy = busyKey === key;
                const rowError = errorByKey[key];
                const tablesWithRoom = sortedTables.filter((table) => tableRemaining(table) > 0);
                return (
                  <div key={entry.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">{entryName(entry, isEnglishDisplay)}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                        {entry.side} · {entry.category} · {labels.remainingOf.replace('{remaining}', String(remaining)).replace('{total}', String(entry.invitedCount))}
                      </p>
                      {rowError && <p className="text-xs text-rose-600 dark:text-rose-400">{rowError}</p>}
                    </div>
                    {tablesWithRoom.length === 0 ? (
                      <p className="shrink-0 text-xs text-gray-400 dark:text-slate-500">{labels.noTablesHint}</p>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={remaining}
                          value={state.seats}
                          onChange={(event) => setRowField(entry.id, 'seats', event.target.value)}
                          disabled={isBusy}
                          className="w-14 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                        />
                        <select
                          value={state.tableId}
                          onChange={(event) => setRowField(entry.id, 'tableId', event.target.value)}
                          disabled={isBusy}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                        >
                          <option value="">{labels.chooseTable}</option>
                          {tablesWithRoom.map((table) => (
                            <option key={table.id} value={table.id}>{table.name} ({tableRemaining(table)} {labels.seatsWord})</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAddToTable(entry)}
                          disabled={isBusy || !state.tableId}
                          className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                        >
                          {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                          {labels.addButton}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tables */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">{labels.tablesHeading} ({tables.length})</h3>
            {canEditLayout && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsTableFormOpen((open) => !open)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Plus size={14} />
                {labels.addTableButton}
              </button>
              {/* Selecting tables for bulk delete previously meant clicking
                  each table's tiny checkbox on the canvas one at a time - a
                  one-click "select all" makes "mark everything, then delete"
                  actually fast when clearing out a whole layout. */}
              {tables.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTableDeleteSelection(new Set(tables.map((table) => table.id)))}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <CheckSquare size={14} />
                  {labels.selectAllTablesButton}
                </button>
              )}
            </div>
            )}
          </div>

          {canEditLayout && tableDeleteSelection.size > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-900/50 dark:bg-rose-950/30">
              <button
                type="button"
                onClick={handleBulkDeleteTables}
                disabled={isBulkDeletingTables}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60 dark:bg-rose-600 dark:hover:bg-rose-500"
              >
                {isBulkDeletingTables ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {labels.deleteSelectedButton} ({tableDeleteSelection.size})
              </button>
              <button
                type="button"
                onClick={() => setTableDeleteSelection(new Set())}
                className="text-sm font-medium text-rose-700 hover:underline dark:text-rose-300"
              >
                {labels.clearSelectionButton}
              </button>
            </div>
          )}
          {bulkDeleteTablesError && <p className="mb-2 text-sm text-rose-600 dark:text-rose-400">{bulkDeleteTablesError}</p>}

          {isTableFormOpen && (
            <form onSubmit={handleCreateTableSubmit} className="mb-3 rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <input
                  type="text"
                  value={tableForm.name}
                  onChange={(event) => setTableForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder={labels.tableNamePlaceholder}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                />
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={tableForm.seatCount}
                  onChange={(event) => setTableForm((prev) => ({ ...prev, seatCount: event.target.value }))}
                  placeholder={labels.tableSeatsPlaceholder}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                />
                <select
                  value={tableForm.shape}
                  onChange={(event) => setTableForm((prev) => ({ ...prev, shape: event.target.value as SeatingTableShape }))}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                >
                  <option value="round">{labels.shapeRound}</option>
                  <option value="rect">{labels.shapeRect}</option>
                  <option value="teardrop">{labels.shapeTeardrop}</option>
                  <option value="curved">{labels.shapeCurved}</option>
                </select>
                <button
                  type="submit"
                  disabled={isSavingTable}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {isSavingTable && <Loader2 size={16} className="animate-spin" />}
                  {isSavingTable ? labels.saving : labels.saveTable}
                </button>
              </div>
              {tableFormError && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{tableFormError}</p>}
            </form>
          )}

          {tables.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">{labels.noTables}</p>
          ) : (
            <>
              <div className="mb-3 inline-flex rounded-xl border border-gray-200 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setTablesView('map')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tablesView === 'map' ? 'bg-gray-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                >
                  <MapIcon size={14} />
                  {labels.viewToggleMap}
                </button>
                <button
                  type="button"
                  onClick={() => setTablesView('list')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tablesView === 'list' ? 'bg-gray-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                >
                  <List size={14} />
                  {labels.viewToggleList}
                </button>
              </div>

              {tablesView === 'map' && (
              <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">{labels.objectsHeading} ({venueObjects.length})</h4>
                {canEditLayout && (
                <button
                  type="button"
                  onClick={() => setIsObjectFormOpen((open) => !open)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Plus size={14} />
                  {labels.addObjectButton}
                </button>
                )}
              </div>

              {canEditLayout && objectDeleteSelection.size > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-900/50 dark:bg-rose-950/30">
                  <button
                    type="button"
                    onClick={handleBulkDeleteObjects}
                    disabled={isBulkDeletingObjects}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60 dark:bg-rose-600 dark:hover:bg-rose-500"
                  >
                    {isBulkDeletingObjects ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {labels.deleteSelectedButton} ({objectDeleteSelection.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => setObjectDeleteSelection(new Set())}
                    className="text-sm font-medium text-rose-700 hover:underline dark:text-rose-300"
                  >
                    {labels.clearSelectionButton}
                  </button>
                </div>
              )}
              {bulkDeleteObjectsError && <p className="mb-2 text-sm text-rose-600 dark:text-rose-400">{bulkDeleteObjectsError}</p>}

              {isObjectFormOpen && (
                <form onSubmit={handleCreateObjectSubmit} className="mb-3 rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <select
                      value={objectForm.type}
                      onChange={(event) => setObjectForm((prev) => ({ ...prev, type: event.target.value as VenueObjectType }))}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                    >
                      <option value="stage">{labels.objectTypeStage}</option>
                      <option value="bar">{labels.objectTypeBar}</option>
                      <option value="entrance">{labels.objectTypeEntrance}</option>
                      <option value="danceFloor">{labels.objectTypeDanceFloor}</option>
                      <option value="custom">{labels.objectTypeCustom}</option>
                    </select>
                    <input
                      type="text"
                      value={objectForm.label}
                      onChange={(event) => setObjectForm((prev) => ({ ...prev, label: event.target.value }))}
                      placeholder={labels.objectLabelPlaceholder}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                    />
                    <button
                      type="submit"
                      disabled={isSavingObject}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                      {isSavingObject && <Loader2 size={16} className="animate-spin" />}
                      {isSavingObject ? labels.saving : labels.saveObject}
                    </button>
                  </div>
                  {objectFormError && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{objectFormError}</p>}
                </form>
              )}

              <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">{labels.canvasHint}</p>

              {/* Search-and-highlight-on-the-map: same idea as the search
                  box in Tables > List, but instead of filtering a text list,
                  clicking a result selects that guest's table on the canvas
                  below - the exact same highlight ring and detail panel as
                  clicking the table directly, so it doubles as a visual
                  "where do they sit" answer. */}
              <div className="relative mb-3">
                <div className="relative">
                  <Search size={14} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 ${isRtl ? 'right-3' : 'left-3'}`} />
                  <input
                    type="text"
                    value={mapSearch}
                    onChange={(event) => setMapSearch(event.target.value)}
                    placeholder={labels.mapSearchPlaceholder}
                    className={`w-full rounded-xl border border-gray-200 bg-white py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700 ${isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
                  />
                </div>
                {mapSearch.trim() && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
                    {mapSearchResults.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">{labels.mapSearchEmpty}</p>
                    ) : (
                      mapSearchResults.map((row) => (
                        <button
                          key={row.entry.id}
                          type="button"
                          onClick={() => {
                            handleMapSearchResultClick(row);
                            setMapSearch('');
                          }}
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-sm hover:bg-gray-50 dark:hover:bg-slate-700"
                        >
                          <span className="font-medium text-gray-900 dark:text-slate-100">{row.name}</span>
                          <span className="text-xs text-gray-500 dark:text-slate-400">
                            {row.tableSummary || labels.mapSearchUnseated}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Two-column layout on wide screens: canvas on the left,
                  selected-item details pinned in a sticky column on the
                  right so it's always visible - never requires scrolling
                  past the canvas to see who's seated at the table you just
                  selected. Below the lg breakpoint it just stacks (details
                  under the canvas), same as before. */}
              <div
                ref={fullScreenContainerRef}
                className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start ${
                  isFullScreen ? 'h-screen overflow-y-auto bg-white p-4 dark:bg-slate-900' : ''
                }`}
              >
              <SeatingFloorPlan
                ref={floorPlanRef}
                tables={sortedTables}
                venueObjects={venueObjects}
                seatsUsedByTable={seatsUsedByTable}
                selectedTableId={selectedTableId}
                onSelectTable={(id) => {
                  setSelectedTableId(id);
                  if (id) setSelectedObjectId(null);
                }}
                selectedObjectId={selectedObjectId}
                onSelectObject={(id) => {
                  setSelectedObjectId(id);
                  if (id) setSelectedTableId(null);
                }}
                onLayoutChange={handleLayoutChange}
                onObjectLayoutChange={handleObjectLayoutChange}
                onDuplicateTable={handleDuplicateTable}
                onDuplicateObject={handleDuplicateObject}
                fullLabel={labels.tableFullBadge}
                zoomOutLabel={labels.zoomOutLabel}
                zoomInLabel={labels.zoomInLabel}
                zoomResetLabel={labels.zoomResetLabel}
                dir={isRtl ? 'rtl' : 'ltr'}
                deleteSelection={tableDeleteSelection}
                onToggleDeleteSelection={toggleTableDeleteSelection}
                deleteObjectSelection={objectDeleteSelection}
                onToggleDeleteObjectSelection={toggleObjectDeleteSelection}
                deleteCheckboxLabel={labels.deleteCheckboxLabel}
                locked={layoutLocked}
                onToggleLocked={handleToggleLayoutLock}
                lockLabel={labels.lockLayoutButton}
                unlockLabel={labels.unlockLayoutButton}
                readOnly={!canEditLayout}
                isFullScreen={isFullScreen}
                onToggleFullScreen={handleToggleFullScreen}
                enterFullScreenLabel={labels.enterFullScreenLabel}
                exitFullScreenLabel={labels.exitFullScreenLabel}
              />

              <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
              {(() => {
                const object = selectedObjectId ? venueObjects.find((candidate) => candidate.id === selectedObjectId) : null;
                if (!object) return null;

                const isEditingObject = editingObjectId === object.id;
                const objectKey = `object-${object.id}`;

                return (
                  <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    {isEditingObject ? (
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <select
                          value={editObjectForm.type}
                          onChange={(event) => setEditObjectForm((prev) => ({ ...prev, type: event.target.value as VenueObjectType }))}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                        >
                          <option value="stage">{labels.objectTypeStage}</option>
                          <option value="bar">{labels.objectTypeBar}</option>
                          <option value="entrance">{labels.objectTypeEntrance}</option>
                          <option value="danceFloor">{labels.objectTypeDanceFloor}</option>
                          <option value="custom">{labels.objectTypeCustom}</option>
                        </select>
                        <input
                          type="text"
                          value={editObjectForm.label}
                          onChange={(event) => setEditObjectForm((prev) => ({ ...prev, label: event.target.value }))}
                          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-semibold text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveObjectEdit(object)}
                          disabled={busyKey === objectKey}
                          className="inline-flex shrink-0 items-center rounded-lg bg-gray-900 p-1.5 text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                        >
                          {busyKey === objectKey ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingObjectId(null)}
                          className="inline-flex shrink-0 items-center rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{object.label}</p>
                        {canEditLayout && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditingObject(object)}
                            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteObject(object)}
                            disabled={busyKey === objectKey}
                            className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            {busyKey === objectKey ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </div>
                        )}
                      </div>
                    )}
                    {errorByKey[objectKey] && <p className="text-xs text-rose-600 dark:text-rose-400">{errorByKey[objectKey]}</p>}
                  </div>
                );
              })()}

              {(() => {
                const table = selectedTableId ? tables.find((candidate) => candidate.id === selectedTableId) : null;
                if (!table) {
                  if (selectedObjectId) return null;
                  return <p className="mt-3 text-xs text-gray-400 dark:text-slate-500">{labels.tableDetailsHint}</p>;
                }

                const used = seatsUsedByTable.get(table.id) ?? 0;
                const isFull = used >= table.seatCount;
                const fillPct = table.seatCount > 0 ? Math.min(100, (used / table.seatCount) * 100) : 0;
                const tableAssignments = (assignmentsByTable.get(table.id) ?? []).slice().sort((a, b) => {
                  const nameA = entryName(entriesById.get(a.rosterEntryId) ?? ({ firstName: '', lastName: '' } as GuestRosterEntry), isEnglishDisplay);
                  const nameB = entryName(entriesById.get(b.rosterEntryId) ?? ({ firstName: '', lastName: '' } as GuestRosterEntry), isEnglishDisplay);
                  return nameA.localeCompare(nameB, locale);
                });
                const isEditing = editingTableId === table.id;
                const tableKey = `table-${table.id}`;

                return (
                  <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    {isEditing ? (
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <input
                          type="text"
                          value={editTableForm.name}
                          onChange={(event) => setEditTableForm((prev) => ({ ...prev, name: event.target.value }))}
                          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-semibold text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                        />
                        <input
                          type="number"
                          min={1}
                          max={40}
                          value={editTableForm.seatCount}
                          onChange={(event) => setEditTableForm((prev) => ({ ...prev, seatCount: event.target.value }))}
                          className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                        />
                        <select
                          value={editTableForm.shape}
                          onChange={(event) => setEditTableForm((prev) => ({ ...prev, shape: event.target.value as SeatingTableShape }))}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                        >
                          <option value="round">{labels.shapeRound}</option>
                          <option value="rect">{labels.shapeRect}</option>
                          <option value="teardrop">{labels.shapeTeardrop}</option>
                          <option value="curved">{labels.shapeCurved}</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleSaveTableEdit(table)}
                          disabled={busyKey === tableKey}
                          className="inline-flex shrink-0 items-center rounded-lg bg-gray-900 p-1.5 text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                        >
                          {busyKey === tableKey ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTableId(null)}
                          className="inline-flex shrink-0 items-center rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{table.name}</p>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isFull ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                            {used}/{table.seatCount}
                            {isFull ? ` · ${labels.tableFullBadge}` : ''}
                          </span>
                          {canEditLayout && (table.shape === 'teardrop' || table.shape === 'curved') && (
                            <button
                              type="button"
                              onClick={() => handleRotateTable(table)}
                              disabled={busyKey === tableKey}
                              title={labels.rotateTableButton}
                              aria-label={labels.rotateTableButton}
                              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-60 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                            >
                              <RotateCw size={13} />
                            </button>
                          )}
                          {canEditLayout && (
                          <button
                            type="button"
                            onClick={() => startEditingTable(table)}
                            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                          >
                            <Pencil size={13} />
                          </button>
                          )}
                          {canEditLayout && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTable(table)}
                            disabled={busyKey === tableKey}
                            className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            {busyKey === tableKey ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                      <div className={`h-full ${isFull ? 'bg-emerald-500' : 'bg-blue-400'}`} style={{ width: `${fillPct}%` }} />
                    </div>

                    {errorByKey[tableKey] && <p className="mb-2 text-xs text-rose-600 dark:text-rose-400">{errorByKey[tableKey]}</p>}

                    {tableAssignments.length === 0 ? (
                      <p className="text-xs text-gray-400 dark:text-slate-500">{labels.unseatedEmpty}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {tableAssignments.map((assignment) => {
                          const entry = entriesById.get(assignment.rosterEntryId);
                          const assignmentKey = `assignment-${assignment.id}`;
                          return (
                            <div key={assignment.id} className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-slate-800">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-gray-800 dark:text-slate-200">{entry ? entryName(entry, isEnglishDisplay) : '-'}</p>
                                {entry && <p className="truncate text-xs text-gray-400 dark:text-slate-500">{entry.side} · {entry.category}</p>}
                              </div>
                              <input
                                type="number"
                                min={0}
                                defaultValue={assignment.seatsCount}
                                key={`${assignment.id}-${assignment.seatsCount}`}
                                disabled={busyKey === assignmentKey}
                                onBlur={(event) => handleAssignmentSeatsChange(assignment, event.target.value)}
                                className="w-12 shrink-0 rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-center text-xs text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveAssignment(assignment)}
                                disabled={busyKey === assignmentKey}
                                className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-200 hover:text-rose-600 disabled:opacity-60 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-rose-400"
                              >
                                {busyKey === assignmentKey ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
              </div>
              </div>
              </>
              )}

              {tablesView === 'list' && (
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={listSearch}
                      onChange={(event) => setListSearch(event.target.value)}
                      placeholder={labels.listSearchPlaceholder}
                      className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                    />
                    <select
                      value={listTableFilter}
                      onChange={(event) => setListTableFilter(event.target.value)}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                    >
                      <option value="">{labels.listTableFilterAll}</option>
                      {sortedTables.map((table) => (
                        <option key={table.id} value={table.id}>{table.name}</option>
                      ))}
                    </select>
                    <select
                      value={listStatusFilter}
                      onChange={(event) => setListStatusFilter(event.target.value as GuestListStatusFilter)}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                    >
                      <option value="all">{labels.listStatusFilterAll}</option>
                      <option value="seated">{labels.listStatusFilterSeated}</option>
                      <option value="partial">{labels.listStatusFilterPartial}</option>
                      <option value="unseated">{labels.listStatusFilterUnseated}</option>
                    </select>
                  </div>

                  {filteredSortedGuestListRows.length === 0 ? (
                    <p className="rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-3 text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">{labels.listEmpty}</p>
                  ) : (
                    <div className="max-h-[520px] overflow-auto rounded-2xl border border-gray-100 dark:border-slate-700">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 dark:bg-slate-800/90 dark:text-slate-400">
                          <tr>
                            <GuestListSortableHeader label={labels.listColumnName} sortKey="name" activeSort={listSort} onSort={handleGuestListSort} />
                            <GuestListSortableHeader label={labels.listColumnSide} sortKey="side" activeSort={listSort} onSort={handleGuestListSort} />
                            <GuestListSortableHeader label={labels.listColumnCategory} sortKey="category" activeSort={listSort} onSort={handleGuestListSort} />
                            <GuestListSortableHeader label={labels.listColumnInvited} sortKey="invitedCount" activeSort={listSort} onSort={handleGuestListSort} />
                            <GuestListSortableHeader label={labels.listColumnStatus} sortKey="status" activeSort={listSort} onSort={handleGuestListSort} />
                            <GuestListSortableHeader label={labels.listColumnTables} sortKey="table" activeSort={listSort} onSort={handleGuestListSort} />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white dark:divide-slate-700 dark:bg-slate-900">
                          {filteredSortedGuestListRows.map((row) => (
                            <tr key={row.entry.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                              <td className="px-3 py-2 font-medium text-gray-900 dark:text-slate-100">{row.name}</td>
                              <td className="px-3 py-2 text-gray-600 dark:text-slate-400">{row.entry.side}</td>
                              <td className="px-3 py-2 text-gray-600 dark:text-slate-400">{row.entry.category}</td>
                              <td className="px-3 py-2 text-gray-600 dark:text-slate-400">{row.entry.invitedCount}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                    row.status === 'seated'
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                      : row.status === 'partial'
                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                        : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300'
                                  }`}
                                >
                                  {row.status === 'seated' ? labels.listStatusFilterSeated : row.status === 'partial' ? labels.listStatusFilterPartial : labels.listStatusFilterUnseated}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-600 dark:text-slate-400">{row.tableSummary || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
