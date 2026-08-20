import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Bell,
    ChevronDown,
    Download,
    Languages,
    Loader2,
    LogOut,
    Moon,
    MoreVertical,
    Pencil,
    RefreshCcw,
    Search,
    Sun,
    Trash2,
    UserCheck,
    Users,
    UserX,
} from 'lucide-react';
import { motion } from 'motion/react';
import logoSgGold from '../assets/logo-sg-gold.png';
import logoSgSilver from '../assets/logo-sg-silver.png';
import { db } from '../firebase';
import { useAdminTheme } from '../hooks/useAdminTheme';
import { Language, translations } from '../i18n';
import { logoutAdmin, onAdminAuthStateChanged } from '../admin/auth';
import { isEventStaffUid } from '../admin/roles';
import { exportRsvpWorkbook } from '../admin/exportRsvpWorkbook';
import { exportGiftsWorkbook } from '../admin/exportGiftsWorkbook';
import { GuestCountInput } from '../components/admin/GuestCountInput';
import { EditableTextField } from '../components/admin/EditableTextField';
import { GuestGroupSelect } from '../components/admin/GuestGroupSelect';
import { InviteLinkVisitsTable, type InviteLinkVisitRecord } from '../components/admin/InviteLinkVisitsTable';
import { GuestRosterSection } from '../components/admin/GuestRosterSection';
import { OldSiteRsvpImportPanel } from '../components/admin/OldSiteRsvpImportPanel';
import { DuplicateFinderPanel } from '../components/admin/DuplicateFinderPanel';
import { loadBaseList, syncBaseListFromSheet, updateBaseListEntry, type BaseListSyncResult } from '../services/baseList';
import type { NormalizedBaseListEntry } from '../utils/baseList';
import { EMPTY_GIFT_AMOUNTS, isEmptyGiftAmounts, type GiftAmounts } from '../utils/gifts';
import { GiftsSection } from '../components/admin/GiftsSection';
import { loadGiftEntries, saveGiftEntry, type GiftEntry } from '../services/giftEntries';
import { WhatsappReminders } from '../components/admin/WhatsappReminders';
import { enableAdminPushNotifications } from '../utils/pushNotifications';
import { firebaseVapidKey } from '../config/firebaseConfig';
import {
    createGuestRosterEntry,
    deleteGuestRosterEntriesForSide,
    deleteGuestRosterEntry,
    loadGuestRoster,
    subscribeToGuestRoster,
    syncGuestRosterFromSheet,
    updateGuestRosterEntry,
    type GuestRosterEntry,
    type GuestRosterEntryInput,
} from '../services/guestRoster';
import { findRosterMatches, fullNamesMatch, linkGuestRosterWithRsvps, resolveRosterMatches, type RosterLinkResult } from '../services/rsvpRosterLink';
import { SeatingSection } from '../components/admin/SeatingSection';
import {
    assignGroupToTable,
    createSeatingGroup,
    createSeatingTable,
    createSeatingTablesBulk,
    deleteSeatingGroup,
    deleteSeatingTable,
    dismissSeatingAlert,
    removeSeatingAssignment,
    setSeatingAssignment,
    setSeatingLayoutLock,
    subscribeToSeatingAlerts,
    subscribeToSeatingAssignments,
    subscribeToSeatingGroups,
    subscribeToSeatingLayoutLock,
    subscribeToSeatingTables,
    syncSeatingAssignmentsWithRoster,
    updateSeatingGroup,
    updateSeatingTable,
    updateSeatingTableLayout,
    type SeatingAlert,
    type SeatingAssignment,
    type SeatingGroup,
    type SeatingTable,
    type SeatingTableLayout,
} from '../services/seating';
import { RONIT_FARM_FINAL_TABLES, RONIT_FARM_FINAL_OBJECTS } from '../admin/venueSeatingLayout';
import {
    createVenueObject,
    deleteVenueObject,
    subscribeToVenueObjects,
    updateVenueObject,
    updateVenueObjectLayout,
    type VenueObject,
    type VenueObjectType,
} from '../services/venueObjects';

interface RSVPRecord {
    id: string;
    fullName: string;
    phone: string;
    guestsCount: number;
    isAttending: boolean;
    note: string;
    group: string;
    lang: string;
    createdAt: Date | null;
    // Admin-picked roster entry ids - set from the responses table when the
    // automatic name match is empty or ambiguous and a human confirms which
    // roster entry/entries are actually correct (usually one, but can be
    // more than one for a single response that covers multiple roster rows,
    // e.g. a couple who RSVP'd together). Empty array means "use automatic
    // matching".
    manualRosterEntryIds: string[];
    // True when isAttending currently reflects an admin's manual correction
    // (from either this tab's own toggle or a status change in the guest
    // roster tab that synced back here) rather than the guest's own most
    // recent submission - shown as a small badge so it's never confused with
    // the guest's actual answer. Cleared automatically the next time the
    // guest submits their own update (see RSVPForm.tsx).
    attendanceSetByAdmin: boolean;
}

type SortKey = 'fullName' | 'guestsCount' | 'group' | 'isAttending' | 'lang' | 'createdAt';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
    key: SortKey;
    direction: SortDirection;
}

interface SortableHeaderProps {
    activeSort: SortConfig;
    className?: string;
    label: string;
    onSort: (key: SortKey) => void;
    sortKey: SortKey;
}

function SortableHeader({ activeSort, className = '', label, onSort, sortKey }: SortableHeaderProps) {
    const isActive = activeSort.key === sortKey;
    const SortIcon = !isActive ? ArrowUpDown : activeSort.direction === 'asc' ? ArrowUp : ArrowDown;

    return (
        <th
            className={`${className} px-4 py-3 font-semibold`}
            aria-sort={isActive ? (activeSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
            <button
                type="button"
                onClick={() => onSort(sortKey)}
                className="inline-flex items-center gap-1.5 rounded-md hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:hover:text-slate-100 dark:focus-visible:ring-slate-600"
            >
                <span>{label}</span>
                <SortIcon size={14} aria-hidden="true" />
            </button>
        </th>
    );
}

type RosterMatchStatus = 'matched' | 'none' | 'ambiguous' | 'empty';

interface RosterMatchInfo {
    status: RosterMatchStatus;
    label: string;
    // True when this "matched" result came from an admin's manual pick(s)
    // (RSVPRecord.manualRosterEntryIds) rather than the automatic
    // name-matching algorithm - shown as a small "Manual" tag so it's clear
    // it was a human decision, and so it's obvious the picker below can
    // still be changed.
    isManual: boolean;
    // The actual roster entries the name-matching algorithm found for
    // 'ambiguous' (more than one) - so the picker below can show exactly
    // those candidates up front instead of making an admin hunt through the
    // entire guest list for a match the system already found. Empty for
    // every other status.
    candidates: GuestRosterEntry[];
}

// Highlights "no match"/"ambiguous" cases with an amber warning badge so
// they catch the eye instead of blending in as plain text - these are the
// ones that need a manual look (fix a typo in the name, or add the guest to
// the roster) since name-matching couldn't place them on its own.
function RosterMatchBadge({ info, manualLabel }: { info: RosterMatchInfo; manualLabel: string }) {
    if (info.status === 'none' || info.status === 'ambiguous') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle size={12} aria-hidden="true" />
                {info.label}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 text-gray-700 dark:text-slate-300">
            {info.label}
            {info.isManual && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    {manualLabel}
                </span>
            )}
        </span>
    );
}

function rosterEntryLabel(entry: GuestRosterEntry): string {
    return `${entry.side} · ${entry.category} · ${entry.firstName} ${entry.lastName}`;
}

function sortRosterEntries(entries: GuestRosterEntry[]): GuestRosterEntry[] {
    return [...entries].sort((first, second) => rosterEntryLabel(first).localeCompare(rosterEntryLabel(second)));
}

// Lets an admin pin a response to specific roster entry/entries when the
// automatic name-matching came back empty or ambiguous (or to correct a
// manual pick made earlier). Always shown alongside the badge above for
// 'none'/'ambiguous' statuses, and also shown (so it can be undone) whenever
// the current match is itself manual.
//
// Checkboxes rather than a single dropdown, since one response sometimes
// covers MORE than one roster row on purpose - e.g. "David et Isabelle" is
// one submitted RSVP but needs to be linked to both their separate roster
// rows so both get counted. For 'ambiguous', the algorithm already found the
// candidates - it just couldn't tell whether one, or all, of them are right
// - so those go in their own "found matches" group at the top of the list
// instead of forcing a search through the entire guest roster. The full
// roster is collapsed behind a toggle in case the real guest(s) aren't among
// what the name-matching considered a candidate.
function RosterMatchPicker({
    record,
    info,
    guestRoster,
    instructions,
    clearLabel,
    foundMatchesLabel,
    fullListLabel,
    showFullListLabel,
    toggleLabel,
    onChange,
}: {
    record: RSVPRecord;
    info: RosterMatchInfo;
    guestRoster: GuestRosterEntry[];
    instructions: string;
    clearLabel: string;
    foundMatchesLabel: string;
    fullListLabel: string;
    showFullListLabel: string;
    toggleLabel: string;
    onChange: (recordId: string, entryIds: string[]) => void;
}) {
    // Collapsed by default - the checkbox list (plus the full-roster list
    // behind its own toggle below) takes real vertical/horizontal room, and
    // most responses never need it opened at all. Keeping it closed until
    // asked for is also what keeps this column narrow enough that the Name
    // column next to it doesn't get squeezed and start truncating names.
    const [isExpanded, setIsExpanded] = useState(false);
    const [isFullListVisible, setIsFullListVisible] = useState(false);

    if (info.status !== 'none' && info.status !== 'ambiguous' && !info.isManual) {
        return null;
    }

    if (!isExpanded) {
        return (
            <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 underline underline-offset-2 dark:text-slate-400"
            >
                <ChevronDown size={12} />
                {toggleLabel}
            </button>
        );
    }

    const selectedIds = new Set(record.manualRosterEntryIds);
    const candidateIds = new Set(info.candidates.map((entry) => entry.id));
    const sortedCandidates = sortRosterEntries(info.candidates);
    const sortedRest = sortRosterEntries(guestRoster.filter((entry) => !candidateIds.has(entry.id)));

    const toggleEntry = (entryId: string) => {
        const next = selectedIds.has(entryId)
            ? record.manualRosterEntryIds.filter((id) => id !== entryId)
            : [...record.manualRosterEntryIds, entryId];
        onChange(record.id, next);
    };

    const renderRow = (entry: GuestRosterEntry) => (
        <label key={entry.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800">
            <input
                type="checkbox"
                checked={selectedIds.has(entry.id)}
                onChange={() => toggleEntry(entry.id)}
                className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-gray-900 focus:ring-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
            />
            <span className="truncate">{rosterEntryLabel(entry)}</span>
        </label>
    );

    return (
        <div className="mt-1 space-y-1.5 rounded-lg border border-gray-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] text-gray-500 dark:text-slate-400">{instructions}</p>
                <button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    className="shrink-0 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
                    aria-label={toggleLabel}
                >
                    <ChevronDown size={14} className="rotate-180" />
                </button>
            </div>

            {sortedCandidates.length > 0 && (
                <div>
                    <p className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">{foundMatchesLabel}</p>
                    {sortedCandidates.map(renderRow)}
                </div>
            )}

            {sortedCandidates.length === 0 ? (
                <div className="max-h-40 overflow-y-auto">{sortedRest.map(renderRow)}</div>
            ) : isFullListVisible ? (
                <div>
                    <p className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">{fullListLabel}</p>
                    <div className="max-h-40 overflow-y-auto">{sortedRest.map(renderRow)}</div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setIsFullListVisible(true)}
                    className="px-1.5 text-[11px] font-medium text-gray-500 underline underline-offset-2 dark:text-slate-400"
                >
                    {showFullListLabel}
                </button>
            )}

            {record.manualRosterEntryIds.length > 0 && (
                <button
                    type="button"
                    onClick={() => onChange(record.id, [])}
                    className="px-1.5 text-[11px] font-medium text-rose-600 underline underline-offset-2 dark:text-rose-400"
                >
                    {clearLabel}
                </button>
            )}
        </div>
    );
}

function toDate(value: unknown): Date | null {
    if (value instanceof Date) {
        return value;
    }
    if (
        typeof value === 'object' &&
        value !== null &&
        'toDate' in value &&
        typeof (value as { toDate?: unknown }).toDate === 'function'
    ) {
        return (value as { toDate: () => Date }).toDate();
    }
    return null;
}

function normalizeRecord(id: string, input: Record<string, unknown>): RSVPRecord {
    const guestsValue = input.guestsCount;
    return {
        id,
        fullName: typeof input.fullName === 'string' ? input.fullName : '',
        phone: typeof input.phone === 'string' ? input.phone : '',
        guestsCount: typeof guestsValue === 'number' && Number.isFinite(guestsValue) ? guestsValue : 0,
        isAttending: input.isAttending === true,
        note: typeof input.note === 'string' ? input.note : '',
        group: typeof input.group === 'string' ? input.group : '',
        lang: typeof input.lang === 'string' ? input.lang : '-',
        createdAt: toDate(input.createdAt),
        manualRosterEntryIds: Array.isArray(input.manualRosterEntryIds)
            ? input.manualRosterEntryIds.filter((entryId): entryId is string => typeof entryId === 'string')
            : [],
        attendanceSetByAdmin: input.attendanceSetByAdmin === true,
    };
}

function normalizeInviteLinkVisit(id: string, input: Record<string, unknown>): InviteLinkVisitRecord {
    return {
        id,
        phone: typeof input.phone === 'string' ? input.phone : id,
        guestName: typeof input.guestName === 'string' ? input.guestName : '',
        guestGroup: typeof input.guestGroup === 'string' ? input.guestGroup : '',
        lang: typeof input.lang === 'string' ? input.lang : '-',
        openedAt: toDate(input.openedAt),
    };
}

async function loadRsvpRecords(): Promise<RSVPRecord[]> {
    const rsvpQuery = query(collection(db, 'rsvps'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(rsvpQuery);
    return snapshot.docs.map((snapshotDoc) => normalizeRecord(snapshotDoc.id, snapshotDoc.data() as Record<string, unknown>));
}

async function loadInviteLinkVisits(): Promise<InviteLinkVisitRecord[]> {
    const inviteLinksQuery = query(collection(db, 'inviteLinkVisits'), orderBy('openedAt', 'desc'));
    const snapshot = await getDocs(inviteLinksQuery);
    return snapshot.docs.map((snapshotDoc) => normalizeInviteLinkVisit(snapshotDoc.id, snapshotDoc.data() as Record<string, unknown>));
}

const PLANNED_GUESTS_STORAGE_KEY = 'rsvp-admin-planned-guests';
// The "invite links opened" panel only records a visit when the link itself
// contains the guest's phone number (a personalized per-guest link). Now
// shown again since the WhatsApp reminders tab generates exactly those
// personalized links - it'll just be empty until reminders actually go out
// and guests start clicking them.
const SHOW_INVITE_LINK_VISITS = true;
const TREND_CHART_WIDTH = 360;
const TREND_CHART_HEIGHT = 160;
const TREND_CHART_PADDING = 18;

interface ChartPoint {
    x: number;
    y: number;
}

function buildChartPoints(values: number[]): ChartPoint[] {
    if (values.length === 0) {
        return [];
    }

    const maxValue = Math.max(...values, 1);

    if (values.length === 1) {
        const y = TREND_CHART_HEIGHT - TREND_CHART_PADDING - (values[0] / maxValue) * (TREND_CHART_HEIGHT - TREND_CHART_PADDING * 2);
        return [{ x: TREND_CHART_PADDING, y }];
    }

    const step = (TREND_CHART_WIDTH - TREND_CHART_PADDING * 2) / (values.length - 1);
    return values
        .map((value, index) => {
            const x = TREND_CHART_PADDING + step * index;
            const y = TREND_CHART_HEIGHT - TREND_CHART_PADDING - (value / maxValue) * (TREND_CHART_HEIGHT - TREND_CHART_PADDING * 2);
            return { x, y };
        });
}

export function AdminDashboard() {
    const { lang } = useParams<{ lang: string }>();
    const navigate = useNavigate();
    const [records, setRecords] = useState<RSVPRecord[]>([]);
    const [inviteLinkVisits, setInviteLinkVisits] = useState<InviteLinkVisitRecord[]>([]);
    const [guestRoster, setGuestRoster] = useState<GuestRosterEntry[]>([]);
    const [baseList, setBaseList] = useState<NormalizedBaseListEntry[]>([]);
    const [isLoadingBaseList, setIsLoadingBaseList] = useState(false);
    const [giftEntries, setGiftEntries] = useState<GiftEntry[]>([]);
    const [isLoadingGiftEntries, setIsLoadingGiftEntries] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deletingInviteLinkVisitId, setDeletingInviteLinkVisitId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDeletingSelected, setIsDeletingSelected] = useState(false);
    // Free-text search above the responses list - matches name, phone, and
    // group, so Gil can find a specific guest's response without scrolling
    // through the whole table. Purely a display filter (see
    // visibleSortedRecords below); it never touches the underlying records.
    const [responseSearchTerm, setResponseSearchTerm] = useState('');
    // Mobile response cards default to a compact one-line summary (name,
    // roster match, status) and only reveal the editable fields + delete
    // button once tapped open - same "one line to scan, one tap to edit"
    // pattern as the Guest Roster mobile cards.
    const [expandedRecordIds, setExpandedRecordIds] = useState<Set<string>>(new Set());
    const toggleRecordExpanded = (id: string) => {
        setExpandedRecordIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };
    const [isExporting, setIsExporting] = useState(false);
    const [isExportingGifts, setIsExportingGifts] = useState(false);
    // The four header actions (theme/refresh/export/logout) used to be four
    // bare icon buttons crammed into a corner - clear enough with a mouse
    // hovering for the title tooltip, but meaningless at a glance and
    // impossible to identify at all on a touchscreen (no hover). Collapsed
    // into a single labeled menu instead, so every action always shows its
    // name in text, not just an icon someone has to guess at.
    const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
    const actionsMenuRef = useRef<HTMLDivElement>(null);
    // 'idle' before the button is first pressed; 'error' carries its own
    // message (invalid config, browser rejected the permission prompt for a
    // reason other than an outright "denied", etc.) separately from the
    // more common denied/unsupported cases so the menu label can be exact.
    const [notificationsStatus, setNotificationsStatus] = useState<'idle' | 'enabling' | 'enabled' | 'denied' | 'unsupported' | 'error'>('idle');
    const [notificationsErrorMessage, setNotificationsErrorMessage] = useState('');
    // Kept only for the Excel export summary sheet, which still includes it -
    // no longer editable or shown anywhere in the dashboard UI itself.
    const [plannedGuests, setPlannedGuests] = useState(0);
    const [activeResponseHour, setActiveResponseHour] = useState<number | null>(null);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'createdAt', direction: 'desc' });
    const [isAuthChecked, setIsAuthChecked] = useState(false);
    const [isSignedIn, setIsSignedIn] = useState(false);
    const [currentUid, setCurrentUid] = useState<string | null>(null);
    // Event-day seating staff only ever get the Seating tab - see
    // src/admin/roles.ts for what this is and how to grant it. `displayedTab`
    // (used everywhere content is gated below) is forced to 'seating' for
    // them regardless of the underlying `activeTab` state, so there's never
    // even a one-render flash of a tab they shouldn't see.
    const isEventStaff = isEventStaffUid(currentUid);
    const [activeTab, setActiveTab] = useState<'roster' | 'responses' | 'reminders' | 'seating' | 'gifts'>('roster');
    const displayedTab = isEventStaff ? 'seating' : activeTab;
    const [seatingTables, setSeatingTables] = useState<SeatingTable[]>([]);
    const [seatingGroups, setSeatingGroups] = useState<SeatingGroup[]>([]);
    const [seatingAssignments, setSeatingAssignments] = useState<SeatingAssignment[]>([]);
    const [seatingAlerts, setSeatingAlerts] = useState<SeatingAlert[]>([]);
    const [seatingLayoutLocked, setSeatingLayoutLocked] = useState(false);
    const [venueObjects, setVenueObjects] = useState<VenueObject[]>([]);
    const [isLoadingSeating, setIsLoadingSeating] = useState(true);
    const { theme, toggleTheme } = useAdminTheme();

    const isValidLang = lang === 'en' || lang === 'he' || lang === 'fr';
    const currentLang = (isValidLang ? lang : 'he') as Language;
    const isRtl = currentLang === 'he';
    const t = translations[currentLang];
    const loginPath = `/${currentLang}/admin`;

    useEffect(() => {
        document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
        document.documentElement.lang = currentLang;
    }, [currentLang, isRtl]);

    // Closes the header actions menu on an outside click or Escape - without
    // this it would only ever close by picking one of its own items.
    useEffect(() => {
        if (!isActionsMenuOpen) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
                setIsActionsMenuOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsActionsMenuOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isActionsMenuOpen]);

    // The "notifications enabled on this device" success banner used to stay
    // on screen forever until the next page reload - harmless, but Gil found
    // it just sits there cluttering the header. Only the success case
    // auto-dismisses; denied/unsupported/error stay visible since those
    // actually need the admin to notice and do something about them.
    useEffect(() => {
        if (notificationsStatus !== 'enabled') {
            return;
        }
        const timeoutId = window.setTimeout(() => setNotificationsStatus('idle'), 5000);
        return () => window.clearTimeout(timeoutId);
    }, [notificationsStatus]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const storedPlannedGuests = window.localStorage.getItem(PLANNED_GUESTS_STORAGE_KEY);
        if (!storedPlannedGuests) {
            return;
        }

        const parsed = Number.parseInt(storedPlannedGuests, 10);
        if (Number.isNaN(parsed) || parsed < 0) {
            return;
        }

        setPlannedGuests(parsed);
    }, []);

    // Firebase Auth state resolves asynchronously. We wait for the first
    // callback before deciding to redirect to login or load guest data -
    // this is what actually gates the dashboard now (the Firestore rules
    // enforce the same check independently on the server side).
    useEffect(() => {
        const unsubscribe = onAdminAuthStateChanged((user) => {
            setIsSignedIn(user !== null);
            setCurrentUid(user ? user.uid : null);
            setIsAuthChecked(true);

            if (user === null) {
                navigate(loginPath, { replace: true });
            }
        });
        return unsubscribe;
    }, [loginPath, navigate]);

    // Live listeners (not one-time loads) for the two things that change
    // while the dashboard is left open - a guest submitting the RSVP form,
    // or the roster being synced/edited - so both the list and every stat
    // derived from it (totals, by-side breakdowns) update on their own,
    // without needing the manual refresh button. Invite link visits stay a
    // one-time load (via handleRefresh) since they're not time-sensitive in
    // the same way.
    useEffect(() => {
        if (!isAuthChecked || !isSignedIn) {
            return;
        }

        setIsLoading(true);
        setError('');

        let rsvpsLoaded = false;
        let rosterLoaded = false;
        const markLoadedIfReady = () => {
            if (rsvpsLoaded && rosterLoaded) {
                setIsLoading(false);
            }
        };

        const rsvpQuery = query(collection(db, 'rsvps'), orderBy('createdAt', 'desc'));
        const unsubscribeRsvps = onSnapshot(
            rsvpQuery,
            (snapshot) => {
                const loadedRecords = snapshot.docs.map((snapshotDoc) => normalizeRecord(snapshotDoc.id, snapshotDoc.data() as Record<string, unknown>));
                setRecords(loadedRecords);
                setSelectedIds((prevSelected) => prevSelected.filter((id) => loadedRecords.some((record) => record.id === id)));
                rsvpsLoaded = true;
                markLoadedIfReady();
            },
            (snapshotError) => {
                console.error('RSVP live listener failed', snapshotError);
                setError(t.adminLoadError);
                rsvpsLoaded = true;
                markLoadedIfReady();
            },
        );

        const unsubscribeRoster = subscribeToGuestRoster(
            (loadedGuestRoster) => {
                setGuestRoster(loadedGuestRoster);
                rosterLoaded = true;
                markLoadedIfReady();
            },
            () => {
                setError(t.adminLoadError);
                rosterLoaded = true;
                markLoadedIfReady();
            },
        );

        loadInviteLinkVisits()
            .then(setInviteLinkVisits)
            .catch((loadError) => console.error('Failed to load invite link visits', loadError));

        setIsLoadingBaseList(true);
        loadBaseList()
            .then(setBaseList)
            .catch((loadError) => console.error('Failed to load base list', loadError))
            .finally(() => setIsLoadingBaseList(false));

        setIsLoadingGiftEntries(true);
        loadGiftEntries()
            .then(setGiftEntries)
            .catch((loadError) => console.error('Failed to load gift entries', loadError))
            .finally(() => setIsLoadingGiftEntries(false));

        // Seating chart data loads independently of the RSVP/roster gate
        // above (it doesn't block the rest of the dashboard) - just tracks
        // its own three collections so the seating tab can show a loading
        // state until all of them have returned at least once.
        let tablesLoaded = false;
        let groupsLoaded = false;
        let assignmentsLoaded = false;
        let venueObjectsLoaded = false;
        const markSeatingLoadedIfReady = () => {
            if (tablesLoaded && groupsLoaded && assignmentsLoaded && venueObjectsLoaded) {
                setIsLoadingSeating(false);
            }
        };
        const unsubscribeSeatingTables = subscribeToSeatingTables(
            (loaded) => {
                setSeatingTables(loaded);
                tablesLoaded = true;
                markSeatingLoadedIfReady();
            },
            () => {
                tablesLoaded = true;
                markSeatingLoadedIfReady();
            },
        );
        const unsubscribeSeatingGroups = subscribeToSeatingGroups(
            (loaded) => {
                setSeatingGroups(loaded);
                groupsLoaded = true;
                markSeatingLoadedIfReady();
            },
            () => {
                groupsLoaded = true;
                markSeatingLoadedIfReady();
            },
        );
        const unsubscribeSeatingAssignments = subscribeToSeatingAssignments(
            (loaded) => {
                setSeatingAssignments(loaded);
                assignmentsLoaded = true;
                markSeatingLoadedIfReady();
            },
            () => {
                assignmentsLoaded = true;
                markSeatingLoadedIfReady();
            },
        );
        const unsubscribeVenueObjects = subscribeToVenueObjects(
            (loaded) => {
                setVenueObjects(loaded);
                venueObjectsLoaded = true;
                markSeatingLoadedIfReady();
            },
            () => {
                venueObjectsLoaded = true;
                markSeatingLoadedIfReady();
            },
        );
        // Doesn't gate isLoadingSeating - alerts are purely supplementary
        // (a "here's what came out" log), never something the rest of the
        // seating tab needs to wait on before it can render.
        const unsubscribeSeatingAlerts = subscribeToSeatingAlerts((loaded) => setSeatingAlerts(loaded));
        // Same - the lock defaults to false (unlocked) until this resolves,
        // so the canvas is never wrongly stuck locked for a moment on load.
        const unsubscribeSeatingLayoutLock = subscribeToSeatingLayoutLock((locked) => setSeatingLayoutLocked(locked));

        return () => {
            unsubscribeRsvps();
            unsubscribeRoster();
            unsubscribeSeatingTables();
            unsubscribeSeatingGroups();
            unsubscribeSeatingAssignments();
            unsubscribeVenueObjects();
            unsubscribeSeatingAlerts();
            unsubscribeSeatingLayoutLock();
        };
    }, [isAuthChecked, isSignedIn, t.adminLoadError]);

    const locale = currentLang === 'he' ? 'he-IL' : currentLang === 'fr' ? 'fr-FR' : 'en-US';
    const formatDate = (value: Date | null) => {
        if (!value) {
            return '-';
        }
        // Numeric-only (no Hebrew month name) so this never mixes RTL text
        // with LTR digits - that mixing is what made the date/time render
        // jumbled and out of order when shown inside a dir="ltr" cell.
        return new Intl.DateTimeFormat(locale, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(value);
    };

    const attendingCount = useMemo(
        () => records.reduce((total, record) => total + (record.isAttending ? record.guestsCount : 0), 0),
        [records],
    );
    const notAttendingCount = useMemo(
        () => records.reduce((total, record) => total + (!record.isAttending ? record.guestsCount : 0), 0),
        [records],
    );

    const funnelSteps = useMemo(() => {
        const steps = [
            { label: t.adminTotalSubmissions, value: records.length },
            { label: t.adminAttendingCount, value: attendingCount },
            { label: t.adminNotAttendingCount, value: notAttendingCount },
        ];

        const maxValue = Math.max(...steps.map((step) => step.value), 1);

        return steps.map((step) => ({
            ...step,
            percent: (step.value / maxValue) * 100,
        }));
    }, [records.length, attendingCount, notAttendingCount, t.adminTotalSubmissions, t.adminAttendingCount, t.adminNotAttendingCount]);

    const hourlyResponses = useMemo(() => {
        const responsesByHour = Array.from({ length: 24 }, () => 0);
        records.forEach((record) => {
            if (!record.createdAt) {
                return;
            }
            responsesByHour[record.createdAt.getHours()] += 1;
        });
        return responsesByHour;
    }, [records]);

    const hourlyChartPoints = useMemo(
        () => buildChartPoints(hourlyResponses),
        [hourlyResponses],
    );

    const hourlyPolylinePoints = useMemo(
        () => hourlyChartPoints.map(({ x, y }) => `${x},${y}`).join(' '),
        [hourlyChartPoints],
    );

    const peakResponseHour = useMemo(() => {
        const count = Math.max(...hourlyResponses);
        return { hour: hourlyResponses.indexOf(count), count };
    }, [hourlyResponses]);

    const groupDistributionData = useMemo(() => {
        const counts = new Map<string, number>();

        records.forEach((record) => {
            if (record.guestsCount <= 0) {
                return;
            }

            const group = record.group.trim() || t.adminGroupUnassigned;
            counts.set(group, (counts.get(group) ?? 0) + record.guestsCount);
        });

        return Array.from(counts, ([label, count]) => ({ label, count }))
            .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label, locale));
    }, [locale, records, t.adminGroupUnassigned]);

    const maxGroupCount = useMemo(
        () => Math.max(...groupDistributionData.map((group) => group.count), 1),
        [groupDistributionData],
    );

    const languageAttendanceData = useMemo(() => {
        const counts = {
            he: { attending: 0, notAttending: 0 },
            en: { attending: 0, notAttending: 0 },
            fr: { attending: 0, notAttending: 0 },
        };

        records.forEach((record) => {
            if (record.lang !== 'he' && record.lang !== 'en' && record.lang !== 'fr') {
                return;
            }

            if (record.isAttending) {
                counts[record.lang].attending += record.guestsCount;
            } else {
                counts[record.lang].notAttending += record.guestsCount;
            }
        });

        return (['he', 'en', 'fr'] as const).map((languageCode) => {
            const attending = counts[languageCode].attending;
            const notAttending = counts[languageCode].notAttending;
            return {
                label: languageCode.toUpperCase(),
                attending,
                notAttending,
                total: attending + notAttending,
            };
        });
    }, [records]);

    const maxLanguageAttendance = useMemo(
        () => Math.max(...languageAttendanceData.map((item) => item.total), 1),
        [languageAttendanceData],
    );

    const guestsDistributionData = useMemo(() => {
        const buckets = [
            { label: '1', count: 0 },
            { label: '2', count: 0 },
            { label: '3', count: 0 },
            { label: '4', count: 0 },
            { label: '5+', count: 0 },
        ];

        records.forEach((record) => {
            if (!record.isAttending) {
                return;
            }

            const bucketIndex = Math.min(Math.max(record.guestsCount, 1), 5) - 1;
            buckets[bucketIndex].count += record.guestsCount;
        });

        return buckets;
    }, [records]);

    const maxGuestsDistribution = useMemo(
        () => Math.max(...guestsDistributionData.map((bucket) => bucket.count), 1),
        [guestsDistributionData],
    );

    const languageBreakdown = useMemo(() => {
        const counts = { he: 0, en: 0, fr: 0, other: 0 };
        records.forEach((record) => {
            if (record.lang === 'he' || record.lang === 'en' || record.lang === 'fr') {
                counts[record.lang] += record.guestsCount;
            } else {
                counts.other += record.guestsCount;
            }
        });
        return counts;
    }, [records]);

    const guestGroups = useMemo(
        () => Array.from(new Set(records.map((record) => record.group).filter(Boolean)))
            .sort((first, second) => first.localeCompare(second, locale)),
        [locale, records],
    );

    // The "כספים" tab has to reflect the MASTER guest list (guestRoster,
    // knownResponse === 'yes'), not just whoever happened to submit an RSVP
    // through the website - a large share of confirmed guests were entered
    // or confirmed by hand (before the site existed, or while it wasn't
    // matching reliably) and only ever exist as a guestRoster entry, never
    // as an rsvps document. Gift amounts are therefore stored in their own
    // giftEntries collection keyed by roster entry id (see
    // services/giftEntries.ts) rather than on the rsvps records themselves.
    const giftEntriesByRosterId = useMemo(
        () => new Map(giftEntries.map((entry) => [entry.rosterEntryId, entry])),
        [giftEntries],
    );

    // Includes every roster entry, not just confirmed-attending ones - some
    // guests send a gift/money despite not attending (or before responding
    // at all), and Gil needs to be able to record that. attendanceStatus
    // lets the Gifts tab show who's who instead of implying everyone listed
    // is attending.
    const giftRecords = useMemo(
        () => guestRoster
            .map((entry) => {
                const giftEntry = giftEntriesByRosterId.get(entry.id);
                return {
                    id: entry.id,
                    fullName: `${entry.firstName} ${entry.lastName}`.trim(),
                    side: entry.side,
                    category: entry.category,
                    guestsCount: entry.invitedCount,
                    giftAmounts: giftEntry?.amounts ?? EMPTY_GIFT_AMOUNTS,
                    attendanceStatus: entry.knownResponse,
                };
            }),
        [guestRoster, giftEntriesByRosterId],
    );

    // baseList phone numbers (digits-only) whose guest has already submitted
    // an RSVP - the WhatsApp reminders tab uses this to hide/tag guests who
    // don't need a reminder any more, so it has to be as accurate as the main
    // guest list, not just "best effort". A guest's RSVP phone rarely matches
    // their baseList phone exactly: the field is optional, guests often
    // submit from a different number, or use it in a different format - so
    // matching by phone alone silently misses real responses (that's exactly
    // what happened with a guest who had confirmed but still showed as "לא
    // ענה"). Matching by the RSVP's own typed name helps, but still misses
    // anyone whose response needed a MANUAL roster-match override in the
    // responses table (that override exists precisely because the automatic
    // name match failed or was ambiguous - so re-deriving from the raw RSVP
    // name here would fail too). The guest roster's own knownResponse is the
    // one place that already reflects every resolution path (automatic
    // match, manual override, or a status Gil set by hand) - so it's checked
    // here too, and is what actually closed the gap for guests like "אבי
    // וזיוה חודרה" who needed a manual match. All three signals only ever
    // ADD matches, never remove one, so this can only reduce false "pending"
    // guests - it can never wrongly mark someone as responded who isn't.
    const respondedPhones = useMemo(() => {
        const respondedPhoneDigits = new Set(records.map((record) => record.phone.replace(/\D/g, '')).filter(Boolean));
        const respondedFullNames = records.map((record) => record.fullName.trim()).filter(Boolean);
        const resolvedRosterNames = guestRoster
            .filter((entry) => entry.knownResponse !== null)
            .map((entry) => `${entry.firstName} ${entry.lastName}`.trim())
            .filter(Boolean);

        const result = new Set<string>();
        baseList.forEach((entry) => {
            const matchesByPhone = respondedPhoneDigits.has(entry.phone);
            const matchesByName = !matchesByPhone && (
                respondedFullNames.some((fullName) => fullNamesMatch(fullName, entry.name)) ||
                resolvedRosterNames.some((rosterName) => fullNamesMatch(rosterName, entry.name))
            );
            if (matchesByPhone || matchesByName) {
                result.add(entry.phone);
            }
        });
        return result;
    }, [baseList, records, guestRoster]);

    // Roster entries still marked "not yet responded" that don't match ANY
    // baseList (phone-list) entry by name - these are exactly why this tab's
    // "still pending" count never lines up with the roster's own pending
    // total for a side: baseList counts unique phone/name rows (a couple
    // sharing one phone is one row here, but two invited people in the
    // roster's headcount), and anyone missing from the phone sheet entirely
    // never shows up in this tab at all, in either direction. Surfacing them
    // explicitly turns "why don't these numbers match" into an actionable
    // list of exactly who still needs a phone number added.
    const rosterEntriesMissingPhone = useMemo(
        () => guestRoster
            .filter((entry) => entry.knownResponse === null)
            .filter((entry) => !baseList.some((baseEntry) => fullNamesMatch(`${entry.firstName} ${entry.lastName}`, baseEntry.name)))
            .map((entry) => ({ name: `${entry.firstName} ${entry.lastName}`.trim(), category: entry.category }))
            .sort((a, b) => a.name.localeCompare(b.name, locale)),
        [guestRoster, baseList, locale],
    );

    // Only confirmed ("yes") roster entries are seatable - per Gil's choice,
    // the seating tab deliberately doesn't show guests who haven't responded
    // yet or declined, to keep it focused on people who are actually coming.
    const confirmedRosterEntries = useMemo(
        () => guestRoster.filter((entry) => entry.knownResponse === 'yes'),
        [guestRoster],
    );

    // Which side/category each site response belongs to, matched by name
    // against the guest roster - display only (mirrors the matching used by
    // the "Link" button in the Roster tab), so this never writes anything,
    // it just answers "who is this on the roster" right in the responses
    // table instead of needing to cross-reference manually.
    const rosterMatchInfoByRecordId = useMemo(() => {
        const map = new Map<string, RosterMatchInfo>();
        records.forEach((record) => {
            if (!record.fullName.trim() && record.manualRosterEntryIds.length === 0) {
                map.set(record.id, { status: 'empty', label: '-', isManual: false, candidates: [] });
                return;
            }

            // Computed from automatic name-matching alone (ignoring any manual
            // pick), so the picker's "found matches" checkboxes stay the same
            // stable list while the admin is in the middle of checking them
            // off - if this were derived from the (manual-aware) resolved
            // result instead, checking the FIRST candidate would immediately
            // make every other candidate disappear from the list, since the
            // manual pick would already "win" and collapse the candidate set
            // down to just the one just checked.
            const automaticMatches = record.fullName.trim() ? findRosterMatches(record.fullName, guestRoster) : [];

            // Mirrors resolveRosterMatches() in rsvpRosterLink.ts exactly, so
            // the badge shown here always agrees with what the auto-linker
            // actually wrote to the roster.
            const { matches, isManual } = resolveRosterMatches(record, guestRoster);

            if (isManual) {
                const label = matches.length === 1
                    ? `${matches[0].side} · ${matches[0].category}`
                    : matches.map((entry) => `${entry.firstName} ${entry.lastName}`.trim()).join(', ');
                map.set(record.id, { status: 'matched', label, isManual: true, candidates: automaticMatches.length > 1 ? automaticMatches : [] });
                return;
            }

            if (automaticMatches.length === 0) {
                map.set(record.id, { status: 'none', label: t.adminNoRosterMatch, isManual: false, candidates: [] });
            } else if (automaticMatches.length > 1) {
                map.set(record.id, { status: 'ambiguous', label: t.adminAmbiguousRosterMatch, isManual: false, candidates: automaticMatches });
            } else {
                map.set(record.id, { status: 'matched', label: `${automaticMatches[0].side} · ${automaticMatches[0].category}`, isManual: false, candidates: [] });
            }
        });
        return map;
    }, [records, guestRoster, t.adminNoRosterMatch, t.adminAmbiguousRosterMatch]);

    const sortedRecords = useMemo(() => {
        const compareText = (first: string, second: string) => first.localeCompare(second, locale, { sensitivity: 'base' });

        return [...records].sort((first, second) => {
            let comparison: number;

            switch (sortConfig.key) {
                case 'guestsCount':
                    comparison = first.guestsCount - second.guestsCount;
                    break;
                case 'isAttending':
                    comparison = Number(first.isAttending) - Number(second.isAttending);
                    break;
                case 'createdAt':
                    comparison = (first.createdAt?.getTime() ?? 0) - (second.createdAt?.getTime() ?? 0);
                    break;
                case 'fullName':
                case 'group':
                case 'lang':
                    comparison = compareText(first[sortConfig.key], second[sortConfig.key]);
                    break;
            }

            if (comparison === 0) {
                comparison = first.id.localeCompare(second.id);
            }

            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });
    }, [locale, records, sortConfig]);

    // What the responses table (mobile cards + desktop rows) actually
    // renders - sortedRecords filtered by the search box above it. Matches
    // name, phone, or group as a plain substring (diacritics/case-insensitive
    // via toLowerCase, no normalization needed for Hebrew) so "select all"
    // below can mean "all rows currently visible", not "all rows that exist".
    const visibleSortedRecords = useMemo(() => {
        const normalizedSearch = responseSearchTerm.trim().toLowerCase();
        if (!normalizedSearch) return sortedRecords;
        return sortedRecords.filter((record) => (
            record.fullName.toLowerCase().includes(normalizedSearch) ||
            record.phone.toLowerCase().includes(normalizedSearch) ||
            record.group.toLowerCase().includes(normalizedSearch)
        ));
    }, [sortedRecords, responseSearchTerm]);

    const rsvpStatusByPhone = useMemo(() => {
        const statusByPhone = new Map<string, boolean>();
        const newestRecords = [...records].sort(
            (first, second) => (second.createdAt?.getTime() ?? 0) - (first.createdAt?.getTime() ?? 0),
        );

        newestRecords.forEach((record) => {
            if (record.phone && !statusByPhone.has(record.phone)) {
                statusByPhone.set(record.phone, record.isAttending);
            }
        });

        return statusByPhone;
    }, [records]);

    // Same reasoning as the roster->baseList rename cascade above: the name/
    // group saved on an inviteLinkVisits doc is a one-time snapshot taken the
    // moment the guest opened their link, not a live link to baseList. If
    // baseList's name is corrected afterward (by hand, or by that cascade),
    // this snapshot would otherwise go stale silently. Rather than requiring
    // a manual "pull names and groups" refresh, just overlay today's baseList
    // name/group here at render time - baseList is already loaded in memory
    // for the reminders tab, so this always reflects the current, correct
    // name with no extra step.
    const baseListByPhone = useMemo(() => new Map(baseList.map((entry) => [entry.phone, entry])), [baseList]);

    const pendingInviteLinkVisits = useMemo(
        () => inviteLinkVisits
            .filter((visit) => !rsvpStatusByPhone.has(visit.phone))
            .map((visit) => {
                const liveGuest = baseListByPhone.get(visit.phone);
                return liveGuest ? { ...visit, guestName: liveGuest.name, guestGroup: liveGuest.group } : visit;
            }),
        [inviteLinkVisits, rsvpStatusByPhone, baseListByPhone],
    );

    // Reflects (and toggles) only the rows currently visible under the
    // search filter, not every record that exists - otherwise "select all"
    // while searching would silently also select rows Gil can't even see.
    const isAllSelected = visibleSortedRecords.length > 0 && visibleSortedRecords.every((record) => selectedIds.includes(record.id));

    const handleLogout = async () => {
        await logoutAdmin();
        navigate(loginPath, { replace: true });
    };

    const handleEnableNotifications = async () => {
        setNotificationsStatus('enabling');
        setNotificationsErrorMessage('');
        if (!firebaseVapidKey) {
            setNotificationsStatus('error');
            setNotificationsErrorMessage(t.adminNotificationsMissingConfig);
            return;
        }
        const result = await enableAdminPushNotifications(firebaseVapidKey);
        if (result.status === 'error') {
            setNotificationsErrorMessage(result.message);
        }
        setNotificationsStatus(result.status);
    };

    const handleRefresh = async () => {
        setIsLoading(true);
        setError('');
        try {
            const [loadedRecords, loadedInviteLinkVisits, loadedGuestRoster, loadedBaseList, loadedGiftEntries] = await Promise.all([
                loadRsvpRecords(),
                loadInviteLinkVisits(),
                loadGuestRoster(),
                loadBaseList(),
                loadGiftEntries(),
            ]);
            setRecords(loadedRecords);
            setInviteLinkVisits(loadedInviteLinkVisits);
            setGuestRoster(loadedGuestRoster);
            setBaseList(loadedBaseList);
            setGiftEntries(loadedGiftEntries);
            setSelectedIds((prevSelected) => prevSelected.filter((id) => loadedRecords.some((record) => record.id === id)));
        } catch (loadError) {
            console.error('Failed to refresh RSVP data', loadError);
            setError(t.adminLoadError);
        } finally {
            setIsLoading(false);
        }
    };

    // Only re-fetches the guest roster (not RSVPs/invite links), so these
    // stay fast and don't disturb unrelated dashboard state.
    const reloadGuestRoster = async () => {
        const loadedGuestRoster = await loadGuestRoster();
        setGuestRoster(loadedGuestRoster);
        return loadedGuestRoster;
    };

    const handleSyncGuestRoster = async () => {
        const result = await syncGuestRosterFromSheet(guestRoster);
        if (result.addedCount > 0 || result.updatedCount > 0) {
            await reloadGuestRoster();
        }
        return result;
    };

    // Browser-based equivalent of running scripts/syncBaseList.ts from a
    // terminal - pulls phone/name/group from Gil's per-side sheet tab(s) and
    // upserts them into baseList, then reloads it so the WhatsApp reminders
    // tab immediately reflects the new guests.
    const handleSyncBaseList = async (): Promise<BaseListSyncResult> => {
        const result = await syncBaseListFromSheet();
        if (result.upsertedCount > 0) {
            setBaseList(await loadBaseList());
        }
        return result;
    };

    // Fixes one baseList guest's name directly (see updateBaseListEntry in
    // services/baseList.ts for why this is needed - the phone-list sheet
    // sync is otherwise the only way this collection ever changes, and Gil
    // never edits that sheet, only the dashboard). Updates local state
    // immediately rather than re-fetching the whole collection, since this
    // is a single-document write.
    const handleUpdateBaseListGuestName = async (phone: string, name: string, group: string): Promise<void> => {
        await updateBaseListEntry(phone, name, group);
        setBaseList((previous) => previous.map((entry) => (entry.phone === phone ? { ...entry, name, group } : entry)));
    };

    // Lets Gil add a phone number for a roster guest who has none, right from
    // the reminders tab's "missing phone" panel, instead of needing to add
    // them to the external phone-number spreadsheet and re-run the sync just
    // to cover one person. updateBaseListEntry upserts by phone, so this
    // works whether or not that phone already happens to exist. The guest
    // then disappears from rosterEntriesMissingPhone on its own next render
    // (their name now matches a real baseList entry).
    const handleAddBaseListPhone = async (name: string, group: string, phone: string): Promise<void> => {
        await updateBaseListEntry(phone, name, group);
        setBaseList((previous) => [...previous.filter((entry) => entry.phone !== phone), { phone, name, group }]);
    };

    // Seating chart handlers - thin wrappers around services/seating.ts.
    // Local state isn't updated manually here because the onSnapshot
    // listeners set up above already keep seatingTables/seatingGroups/
    // seatingAssignments current on their own.
    const handleCreateSeatingTable = async (name: string, seatCount: number, layout: SeatingTableLayout): Promise<void> => {
        await createSeatingTable(name, seatCount, layout);
    };

    const handleUpdateSeatingTable = async (id: string, name: string, seatCount: number, layout: SeatingTableLayout): Promise<void> => {
        await updateSeatingTable(id, name, seatCount, layout);
    };

    const handleUpdateSeatingTableLayout = async (id: string, layout: SeatingTableLayout): Promise<void> => {
        await updateSeatingTableLayout(id, layout);
    };

    const handleDeleteSeatingTable = async (id: string): Promise<void> => {
        await deleteSeatingTable(id, seatingAssignments);
    };

    const handleCreateSeatingGroup = async (name: string, memberEntryIds: string[]): Promise<void> => {
        await createSeatingGroup(name, memberEntryIds);
    };

    const handleUpdateSeatingGroup = async (id: string, name: string, memberEntryIds: string[]): Promise<void> => {
        await updateSeatingGroup(id, name, memberEntryIds);
    };

    const handleDeleteSeatingGroup = async (id: string): Promise<void> => {
        await deleteSeatingGroup(id);
    };

    const handleSetSeatingAssignment = async (rosterEntryId: string, tableId: string, seatsCount: number): Promise<void> => {
        await setSeatingAssignment(rosterEntryId, tableId, seatsCount);
    };

    const handleRemoveSeatingAssignment = async (rosterEntryId: string, tableId: string): Promise<void> => {
        await removeSeatingAssignment(rosterEntryId, tableId);
    };

    const handleAssignSeatingGroupToTable = async (group: SeatingGroup, tableId: string): Promise<void> => {
        const remainingByEntryId = new Map<string, number>();
        guestRoster.forEach((entry) => {
            if (entry.knownResponse !== 'yes') return;
            const assigned = seatingAssignments
                .filter((assignment) => assignment.rosterEntryId === entry.id)
                .reduce((sum, assignment) => sum + assignment.seatsCount, 0);
            remainingByEntryId.set(entry.id, entry.invitedCount - assigned);
        });

        const table = seatingTables.find((candidate) => candidate.id === tableId);
        if (!table) return;
        const used = seatingAssignments
            .filter((assignment) => assignment.tableId === tableId)
            .reduce((sum, assignment) => sum + assignment.seatsCount, 0);

        await assignGroupToTable(group, tableId, remainingByEntryId, table.seatCount - used);
    };

    // One-click seed of the 21 dinner tables plus the bar/production
    // booth/restrooms from the venue's final produced seating sketch (see
    // src/admin/venueSeatingLayout.ts) - purely additive, never touches
    // whatever tables or objects already exist.
    const handleGenerateVenueTables = async (): Promise<void> => {
        await createSeatingTablesBulk(RONIT_FARM_FINAL_TABLES);
        await Promise.all(
            RONIT_FARM_FINAL_OBJECTS.map((object) => createVenueObject(object.type, object.label, object.layout)),
        );
    };

    const handleCreateVenueObject = async (type: VenueObjectType, label: string, layout: SeatingTableLayout): Promise<void> => {
        await createVenueObject(type, label, layout);
    };

    const handleUpdateVenueObject = async (id: string, type: VenueObjectType, label: string, layout: SeatingTableLayout): Promise<void> => {
        await updateVenueObject(id, type, label, layout);
    };

    const handleUpdateVenueObjectLayout = async (id: string, layout: SeatingTableLayout): Promise<void> => {
        await updateVenueObjectLayout(id, layout);
    };

    const handleDeleteVenueObject = async (id: string): Promise<void> => {
        await deleteVenueObject(id);
    };

    // Wipes every roster entry for one side and immediately re-pulls it from
    // the sheet - fixes duplicate rows left behind when a category name was
    // renamed in the sheet after that side was first imported.
    const handleResetGuestRosterSide = async (side: string): Promise<{ deletedCount: number; addedCount: number }> => {
        const deletedCount = await deleteGuestRosterEntriesForSide(guestRoster, side);
        const afterDelete = await reloadGuestRoster();
        const result = await syncGuestRosterFromSheet(afterDelete);
        if (result.addedCount > 0 || result.updatedCount > 0) {
            await reloadGuestRoster();
        }
        return { deletedCount, addedCount: result.addedCount };
    };

    // Matches submitted RSVPs to roster entries by name and updates each
    // match's knownResponse/invitedCount automatically, so the roster stays
    // current without manually cross-referencing every RSVP by hand.
    const handleLinkGuestRosterWithRsvps = async (): Promise<RosterLinkResult> => {
        const result = await linkGuestRosterWithRsvps(
            guestRoster,
            records.map((record) => ({
                fullName: record.fullName,
                isAttending: record.isAttending,
                guestsCount: record.guestsCount,
                manualRosterEntryIds: record.manualRosterEntryIds,
            })),
        );
        if (result.updatedCount > 0 || result.revertedCount > 0) {
            await reloadGuestRoster();
        }
        return result;
    };

    // Runs the same name-matching as the manual "Link" button above, but on
    // its own whenever records/roster change (a guest submits, the sheet
    // gets re-synced, etc.) - so the roster's status/count stays current
    // without anyone needing to remember to press a button. Guarded by a ref
    // (not state) so overlapping runs never stack up, and safe to re-trigger
    // itself: linkGuestRosterWithRsvps only ever writes an entry that's
    // actually different, so a second pass after its own write finds nothing
    // left to change and quietly stops.
    //
    // Deliberately does NOT bail out when records.length === 0 - deleting
    // the last (or only) linked RSVP still needs this to run so its revert
    // pass can flip that roster entry back to "not yet responded". Only
    // guestRoster being empty means there's truly nothing to do.
    const isAutoLinkingRosterRef = useRef(false);
    useEffect(() => {
        if (!isAuthChecked || !isSignedIn) return;
        if (guestRoster.length === 0) return;
        if (isAutoLinkingRosterRef.current) return;

        isAutoLinkingRosterRef.current = true;
        linkGuestRosterWithRsvps(
            guestRoster,
            records.map((record) => ({
                fullName: record.fullName,
                isAttending: record.isAttending,
                guestsCount: record.guestsCount,
                manualRosterEntryIds: record.manualRosterEntryIds,
            })),
        )
            .catch((linkError) => {
                console.error('Automatic roster linking failed', linkError);
            })
            .finally(() => {
                isAutoLinkingRosterRef.current = false;
            });
    }, [records, guestRoster, isAuthChecked, isSignedIn]);

    // Auto-fills a response's own "group" tag (used for the group-select
    // dropdown, its own distribution chart, etc.) from the roster match
    // shown in the "Side/Category" column - only when the response doesn't
    // already have a group set (never overwrites a manual choice) and the
    // name matches exactly one roster entry (skips "no match"/"ambiguous"
    // cases, same as everywhere else this matching is used). Otherwise the
    // two columns showed inconsistent info: "Side/Category" correctly
    // identified the guest, but "Group" stayed "no group" forever since
    // nothing ever wrote to it.
    const isAutoFillingGroupRef = useRef(false);
    useEffect(() => {
        if (!isAuthChecked || !isSignedIn) return;
        if (records.length === 0 || guestRoster.length === 0) return;
        if (isAutoFillingGroupRef.current) return;

        const updates = records
            .filter((record) => !record.group.trim() && record.fullName.trim())
            .map((record) => {
                const { matches } = resolveRosterMatches(record, guestRoster);
                // A manual multi-pick (e.g. a couple linked to two roster
                // rows) can still auto-fill the group, as long as every
                // matched row agrees on the category - if they don't, it's
                // not safe to guess which one the group should follow.
                const sharedCategory = matches.length > 0 && matches.every((entry) => entry.category.trim() === matches[0].category.trim())
                    ? matches[0].category.trim()
                    : '';
                return sharedCategory ? { id: record.id, category: sharedCategory } : null;
            })
            .filter((update): update is { id: string; category: string } => update !== null);

        if (updates.length === 0) return;

        isAutoFillingGroupRef.current = true;
        Promise.all(
            updates.map((update) =>
                updateDoc(doc(db, 'rsvps', update.id), { group: update.category }).then(() => {
                    setRecords((prevRecords) => prevRecords.map((record) => (
                        record.id === update.id ? { ...record, group: update.category } : record
                    )));
                }),
            ),
        )
            .catch((autoFillError) => {
                console.error('Automatic group fill from roster match failed', autoFillError);
            })
            .finally(() => {
                isAutoFillingGroupRef.current = false;
            });
    }, [records, guestRoster, isAuthChecked, isSignedIn]);

    // Keeps the seating chart honest whenever a confirmed guest's status or
    // headcount changes underneath it - whether that's the guest editing
    // their own RSVP (which flows into guestRoster via the auto-link effect
    // above), Gil editing their status/count by hand, or a linked RSVP being
    // deleted. Runs automatically on every guestRoster/seatingAssignments
    // change rather than needing a button, same pattern as the auto-link and
    // auto-fill-group effects above - and just as safe to re-trigger, since
    // syncSeatingAssignmentsWithRoster only ever touches an assignment that's
    // actually over its entry's current allowance, so a second pass after its
    // own writes finds nothing left to do. Waits for isLoadingSeating to
    // clear first so it never acts on a still-empty (not yet loaded)
    // assignments/tables list.
    const isSyncingSeatingRef = useRef(false);
    useEffect(() => {
        if (!isAuthChecked || !isSignedIn) return;
        if (isLoadingSeating) return;
        if (isSyncingSeatingRef.current) return;

        isSyncingSeatingRef.current = true;
        syncSeatingAssignmentsWithRoster(guestRoster, seatingAssignments, seatingTables, seatingAlerts)
            .catch((syncError) => {
                console.error('Automatic seating sync with roster failed', syncError);
            })
            .finally(() => {
                isSyncingSeatingRef.current = false;
            });
    }, [guestRoster, seatingAssignments, seatingTables, seatingAlerts, isLoadingSeating, isAuthChecked, isSignedIn]);

    const handleDismissSeatingAlert = async (id: string): Promise<void> => {
        await dismissSeatingAlert(id);
    };

    const handleToggleSeatingLayoutLock = async (locked: boolean): Promise<void> => {
        await setSeatingLayoutLock(locked);
    };

    const handleCreateGuestRosterEntry = async (input: GuestRosterEntryInput) => {
        await createGuestRosterEntry(input);
        await reloadGuestRoster();
    };

    // Gil edits guest names in exactly one place - the general roster - and
    // expects that to be the end of it. baseList (the WhatsApp reminders
    // list) is a separate collection with no shared key to the roster, so it
    // never picked up the rename on its own; that's what previously left the
    // reminders tab showing a stale name until someone used the reminders
    // tab's own pencil-edit. Rather than requiring that second edit, cascade
    // the rename to baseList automatically here, right when the roster edit
    // happens: look up the OLD full name against baseList using the same
    // tolerant fuzzy matcher used everywhere else, and if it lands on exactly
    // one entry, rename that entry too. Only acts on an unambiguous single
    // match - if the old name matches zero or more than one baseList entry,
    // leave it alone rather than risk renaming the wrong person (the
    // reminders tab's pencil-edit remains available as a manual fallback for
    // those rarer cases).
    const handleUpdateGuestRosterEntry = async (id: string, input: GuestRosterEntryInput) => {
        const previousEntry = guestRoster.find((entry) => entry.id === id);
        const previousFullName = previousEntry ? `${previousEntry.firstName} ${previousEntry.lastName}`.trim() : '';
        const nextFullName = `${input.firstName} ${input.lastName}`.trim();

        // A status OR headcount edit on an entry that's linked to a real
        // submission needs to change that submission itself, not just this
        // roster row - otherwise the automatic RSVP-roster linker (the
        // effect above, which exists specifically to keep the roster
        // matching the real submissions) would just re-derive this entry's
        // values from the RSVP again on its very next pass and silently
        // overwrite the edit. That reverting is exactly the "changes revert
        // by themselves" behavior Gil ran into before isAttending was
        // syncable this way - and headcount had the exact same gap (bumping
        // a linked guest from 1 to 2 kept snapping back to 1) until now.
        const statusChanged = previousEntry?.linkedFromRsvp === true && input.knownResponse !== previousEntry.knownResponse;
        const countChanged = previousEntry?.linkedFromRsvp === true && input.invitedCount !== previousEntry.invitedCount;

        if (statusChanged || countChanged) {
            if (statusChanged && input.knownResponse === null) {
                setError(t.adminRosterCannotClearLinkedStatus);
                throw new Error('cannot-clear-linked-status');
            }
            try {
                await syncRosterChangeToRsvp(id, {
                    ...(statusChanged ? { isAttending: input.knownResponse === 'yes' } : {}),
                    ...(countChanged ? { guestsCount: input.invitedCount } : {}),
                });
            } catch (syncError) {
                console.error('Failed to sync roster change back to the linked RSVP', syncError);
                setError(t.adminRosterSyncToRsvpError);
                throw syncError;
            }
            // Deliberately does NOT also call updateGuestRosterEntry/
            // reloadGuestRoster here - the RSVP write above is what the
            // automatic linker (subscribed to `records`) reacts to, and it's
            // the one place that correctly re-derives this entry's
            // knownResponse/linkedFromRsvp/invitedCount together. Writing the
            // roster directly here too, in parallel, would race with that
            // and could briefly (harmlessly, but confusingly) flip
            // linkedFromRsvp back to false for no reason.
            return;
        }

        // Preserve the link flags from the existing doc: this call handles
        // name/category/etc edits (never status/count, handled above), and
        // GuestRosterSection never passes linkedFromRsvp/preLinkInvitedCount
        // itself (see GuestRosterEntryInput) - without this, toEntryDocData's
        // defaults would silently reset a linked entry's linkedFromRsvp back
        // to false on every plain name or category edit.
        await updateGuestRosterEntry(id, {
            ...input,
            linkedFromRsvp: input.linkedFromRsvp ?? previousEntry?.linkedFromRsvp ?? false,
            preLinkInvitedCount: input.preLinkInvitedCount ?? previousEntry?.preLinkInvitedCount ?? null,
        });
        await reloadGuestRoster();

        if (previousFullName && nextFullName && previousFullName !== nextFullName) {
            const baseListMatches = baseList.filter((entry) => fullNamesMatch(previousFullName, entry.name));
            if (baseListMatches.length === 1 && baseListMatches[0].name !== nextFullName) {
                try {
                    await handleUpdateBaseListGuestName(baseListMatches[0].phone, nextFullName, baseListMatches[0].group);
                } catch (cascadeError) {
                    console.error('Failed to cascade roster name edit to baseList', cascadeError);
                }
            }
        }
    };

    const handleDeleteGuestRosterEntry = async (id: string) => {
        await deleteGuestRosterEntry(id);
        await reloadGuestRoster();
    };

    const handleToggleRecordSelection = (recordId: string) => {
        setSelectedIds((prevSelected) => {
            if (prevSelected.includes(recordId)) {
                return prevSelected.filter((id) => id !== recordId);
            }
            return [...prevSelected, recordId];
        });
    };

    const handleToggleAllSelection = () => {
        const visibleIds = visibleSortedRecords.map((record) => record.id);
        if (isAllSelected) {
            // Unselect only the visible rows - any selection outside the
            // current search (there shouldn't normally be any, but this is
            // the safe behavior) is left untouched rather than silently
            // wiped out.
            setSelectedIds((prevSelected) => prevSelected.filter((id) => !visibleIds.includes(id)));
            return;
        }
        setSelectedIds((prevSelected) => Array.from(new Set([...prevSelected, ...visibleIds])));
    };

    const handleExport = async () => {
        if ((records.length === 0 && guestRoster.length === 0) || isExporting) {
            return;
        }

        setIsExporting(true);
        setError('');

        try {
            await exportRsvpWorkbook({
                records: sortedRecords,
                guestRoster,
                plannedGuests,
                isRtl,
                labels: {
                    summarySheet: currentLang === 'he' ? 'סיכום' : currentLang === 'fr' ? 'Résumé' : 'Summary',
                    recordsSheet: currentLang === 'he' ? 'תגובות מהאתר' : currentLang === 'fr' ? 'Réponses RSVP' : 'Site Responses',
                    rosterSheet: t.adminRosterTitle,
                    totalSubmissions: t.adminTotalSubmissions,
                    attendingCount: t.adminAttendingCount,
                    notAttendingCount: t.adminNotAttendingCount,
                    totalGuestsComing: t.adminTotalGuestsComing,
                    plannedGuests: t.adminPlannedGuestsTitle,
                    languageBreakdown: t.adminLanguageBreakdown,
                    id: 'ID',
                    index: t.adminTableIndex,
                    name: t.adminTableName,
                    phone: t.adminTablePhone,
                    guests: t.adminTableGuests,
                    group: t.adminTableGroup,
                    note: t.adminTableNote,
                    status: t.adminTableStatus,
                    language: t.adminTableLanguage,
                    submittedAt: t.adminTableSubmittedAt,
                    attending: t.adminStatusAttending,
                    notAttending: t.adminStatusNotAttending,
                    rosterOverallHeading: t.adminRosterOverallHeading,
                    rosterSideBreakdown: t.adminRosterSideBreakdown,
                    rosterTotalInvited: t.adminRosterTotalInvited,
                    rosterConfirmed: t.adminRosterConfirmed,
                    rosterDeclined: t.adminRosterDeclined,
                    rosterPending: t.adminRosterPending,
                    rosterSide: t.adminRosterSide,
                    rosterCategory: t.adminRosterCategory,
                    rosterInvitedCount: t.adminRosterInvitedCount,
                    rosterStatus: t.adminTableStatus,
                },
            });
        } catch (exportError) {
            console.error('Failed to export RSVP data', exportError);
            setError(t.adminExportExcelError);
        } finally {
            setIsExporting(false);
        }
    };

    const handleSort = (key: SortKey) => {
        setSortConfig((currentSort) => ({
            key,
            direction: currentSort.key === key && currentSort.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0) {
            return;
        }

        if (!window.confirm(t.adminDeleteSelectedConfirm)) {
            return;
        }

        setIsDeletingSelected(true);
        setError('');

        try {
            const idsToDelete = [...selectedIds];
            const deleteResults = await Promise.allSettled(idsToDelete.map((recordId) => deleteDoc(doc(db, 'rsvps', recordId))));

            const deletedIds: string[] = [];
            let hasFailure = false;

            deleteResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    deletedIds.push(idsToDelete[index]);
                } else {
                    hasFailure = true;
                }
            });

            if (deletedIds.length > 0) {
                setRecords((prevRecords) => prevRecords.filter((record) => !deletedIds.includes(record.id)));
            }

            setSelectedIds((prevSelected) => prevSelected.filter((id) => !deletedIds.includes(id)));

            if (hasFailure) {
                setError(t.adminDeleteSelectedError);
            }
        } finally {
            setIsDeletingSelected(false);
        }
    };

    const handleDelete = async (recordId: string) => {
        if (isDeletingSelected) {
            return;
        }

        if (!window.confirm(t.adminDeleteConfirm)) {
            return;
        }

        setDeletingId(recordId);
        setError('');

        try {
            await deleteDoc(doc(db, 'rsvps', recordId));
            setRecords((prevRecords) => prevRecords.filter((record) => record.id !== recordId));
            setSelectedIds((prevSelected) => prevSelected.filter((id) => id !== recordId));
        } catch (deleteError) {
            console.error('Failed to delete RSVP record', deleteError);
            setError(t.adminDeleteError);
        } finally {
            setDeletingId(null);
        }
    };

    const handleDeleteInviteLinkVisit = async (visitId: string) => {
        if (deletingInviteLinkVisitId !== null) {
            return;
        }

        if (!window.confirm(t.adminInviteLinkDeleteConfirm)) {
            return;
        }

        setDeletingInviteLinkVisitId(visitId);
        setError('');

        try {
            await deleteDoc(doc(db, 'inviteLinkVisits', visitId));
            setInviteLinkVisits((prevVisits) => prevVisits.filter((visit) => visit.id !== visitId));
        } catch (deleteError) {
            console.error('Failed to delete invite link visit', deleteError);
            setError(t.adminInviteLinkDeleteError);
        } finally {
            setDeletingInviteLinkVisitId(null);
        }
    };

    // Lets an admin fix a typo'd guest name right in the table. No extra
    // wiring needed to re-match it to the roster: the automatic roster-link
    // effect already reruns on every change to `records` (see above), so a
    // corrected name that now matches a roster entry gets linked to the
    // right side/category on its own, right after this save.
    const handleFullNameChange = async (recordId: string, fullName: string) => {
        setError('');
        try {
            await updateDoc(doc(db, 'rsvps', recordId), { fullName });
            setRecords((prevRecords) => prevRecords.map((record) => (
                record.id === recordId ? { ...record, fullName } : record
            )));
        } catch (updateError) {
            console.error('Failed to update guest full name', updateError);
            setError(t.adminFullNameUpdateError);
            throw updateError;
        }
    };

    const handleGroupChange = async (recordId: string, group: string) => {
        setError('');
        try {
            await updateDoc(doc(db, 'rsvps', recordId), { group });
            setRecords((prevRecords) => prevRecords.map((record) => (
                record.id === recordId ? { ...record, group } : record
            )));
        } catch (updateError) {
            console.error('Failed to update guest group', updateError);
            setError(t.adminGroupUpdateError);
            throw updateError;
        }
    };

    const handleGuestCountChange = async (recordId: string, guestsCount: number) => {
        setError('');
        try {
            await updateDoc(doc(db, 'rsvps', recordId), { guestsCount });
            setRecords((prevRecords) => prevRecords.map((record) => (
                record.id === recordId ? { ...record, guestsCount } : record
            )));
        } catch (updateError) {
            console.error('Failed to update guest count', updateError);
            setError(t.adminGuestCountUpdateError);
            throw updateError;
        }
    };

    // Lets Gil correct a guest's attending/not-attending status directly
    // from the dashboard - e.g. a guest calls to say plans changed - instead
    // of relying on the guest reopening their own personal link (which only
    // works if it's the exact same browser/device they originally submitted
    // from). Mirrors handleFullNameChange/handleGuestCountChange above.
    const [updatingAttendanceId, setUpdatingAttendanceId] = useState<string | null>(null);
    const handleAttendanceChange = async (recordId: string, isAttending: boolean) => {
        setError('');
        setUpdatingAttendanceId(recordId);
        try {
            await updateDoc(doc(db, 'rsvps', recordId), { isAttending, attendanceSetByAdmin: true });
            setRecords((prevRecords) => prevRecords.map((record) => (
                record.id === recordId ? { ...record, isAttending, attendanceSetByAdmin: true } : record
            )));
        } catch (updateError) {
            console.error('Failed to update attendance status', updateError);
            setError(t.adminAttendanceUpdateError);
        } finally {
            setUpdatingAttendanceId(null);
        }
    };

    // Finds the one RSVP record currently matched to a given roster entry -
    // the mirror image of resolveRosterMatches (which goes RSVP -> roster
    // entries), needed here to go the other way when a status edit happens
    // in the roster tab. Deliberately conservative: only returns a record
    // when exactly one match is found. Zero matches means the entry isn't
    // actually tied to a live submission (stale link); more than one is a
    // genuinely ambiguous case the automatic linker itself would never have
    // produced on its own - either way, guessing which RSVP to overwrite
    // would risk changing the wrong guest's answer, so both are treated as
    // "can't sync automatically" rather than picked at random.
    const findSingleLinkedRsvpRecord = (rosterEntryId: string): RSVPRecord | 'none' | 'ambiguous' => {
        const matchingRecords = records.filter((record) => resolveRosterMatches(record, guestRoster).matches.some((entry) => entry.id === rosterEntryId));
        if (matchingRecords.length === 0) return 'none';
        if (matchingRecords.length > 1) return 'ambiguous';
        return matchingRecords[0];
    };

    // Mirrors handleAttendanceChange above, but triggered from the guest
    // roster tab instead of the Responses tab - see handleUpdateGuestRosterEntry,
    // which calls this only when a roster entry's status and/or headcount
    // actually changed and that entry is currently linked to a real
    // submission. Writes straight to the RSVP document itself (never the
    // roster row directly) so the automatic RSVP-roster linker re-derives
    // the SAME value on its very next pass instead of silently reverting the
    // edit - that reverting is exactly what happened before headcount edits
    // were covered here too (Gil bumping a linked guest from 1 to 2 kept
    // snapping back to 1, since only isAttending used to be protected this
    // way). Throws (rather than swallowing the error) so the roster-tab
    // caller can surface it right next to the field the admin was just
    // editing, instead of only in the page-level error banner.
    const syncRosterChangeToRsvp = async (
        rosterEntryId: string,
        changes: { isAttending?: boolean; guestsCount?: number },
    ) => {
        const linkedRecord = findSingleLinkedRsvpRecord(rosterEntryId);
        if (linkedRecord === 'none' || linkedRecord === 'ambiguous') {
            throw new Error(linkedRecord);
        }
        const updates: Record<string, unknown> = { ...changes };
        if (changes.isAttending !== undefined) {
            updates.attendanceSetByAdmin = true;
        }
        await updateDoc(doc(db, 'rsvps', linkedRecord.id), updates);
        setRecords((prevRecords) => prevRecords.map((record) => (
            record.id === linkedRecord.id
                ? { ...record, ...changes, ...(changes.isAttending !== undefined ? { attendanceSetByAdmin: true } : {}) }
                : record
        )));
    };

    // Pins (or, passing an empty array, un-pins) a response to specific
    // roster entry/entries - used from the picker shown for "no
    // match"/"ambiguous" statuses so an admin can confirm the correct
    // guest(s) by hand instead of leaving it uncounted. Usually one entry,
    // but can be more than one when a single response covers multiple
    // roster rows (e.g. a couple who RSVP'd together). Always wins over
    // automatic name matching afterwards (see resolveRosterMatches in
    // rsvpRosterLink.ts).
    const handleManualRosterMatchChange = async (recordId: string, entryIds: string[]) => {
        setError('');
        try {
            await updateDoc(doc(db, 'rsvps', recordId), { manualRosterEntryIds: entryIds });
            setRecords((prevRecords) => prevRecords.map((record) => (
                record.id === recordId ? { ...record, manualRosterEntryIds: entryIds } : record
            )));
        } catch (updateError) {
            console.error('Failed to update manual roster match', updateError);
            setError(t.adminManualMatchUpdateError);
            throw updateError;
        }
    };

    // Records money actually received from a confirmed-attending guestRoster
    // entry (the "כספים" tab) - one optional amount per payment method, so a
    // guest can split their gift across more than one (e.g. 500 in cash and
    // 500 by Bit) instead of forcing a single amount + a single method.
    // Clearing every field (all three null) deletes the record entirely (see
    // saveGiftEntry), which is how a row moves back onto the "still missing
    // an amount" list.
    const handleUpdateRosterGift = async (rosterEntryId: string, amounts: GiftAmounts) => {
        setError('');
        try {
            await saveGiftEntry(rosterEntryId, amounts);
            setGiftEntries((previous) => {
                const withoutEntry = previous.filter((entry) => entry.rosterEntryId !== rosterEntryId);
                if (isEmptyGiftAmounts(amounts)) {
                    return withoutEntry;
                }
                return [...withoutEntry, { rosterEntryId, amounts }];
            });
        } catch (updateError) {
            console.error('Failed to update gift amounts', updateError);
            setError(t.adminGiftUpdateError);
            throw updateError;
        }
    };

    const handleExportGifts = async () => {
        if (giftRecords.length === 0 || isExportingGifts) {
            return;
        }

        setIsExportingGifts(true);
        setError('');
        try {
            await exportGiftsWorkbook({
                records: giftRecords,
                isRtl,
                labels: {
                    summarySheet: t.adminGiftsExportSummarySheet,
                    detailsSheet: t.adminGiftsExportDetailsSheet,
                    totalReceived: t.adminGiftsTotalLabel,
                    missingCount: t.adminGiftsMissingLabel,
                    byMethodHeading: t.adminGiftsExportByMethodHeading,
                    methodCash: t.adminGiftsMethodCash,
                    methodBitPaybox: t.adminGiftsMethodBitPaybox,
                    methodCheck: t.adminGiftsMethodCheck,
                    bySideHeading: t.adminGiftsBySideHeading,
                    byCategoryHeading: t.adminGiftsByCategoryHeading,
                    name: t.adminTableName,
                    side: t.adminGiftsExportSide,
                    category: t.adminGiftsByCategoryHeading,
                    guests: t.adminGiftsGuestsWord,
                    total: t.adminGiftsExportTotal,
                    status: t.adminTableStatus,
                    statusRecorded: t.adminGiftsExportStatusRecorded,
                    statusMissing: t.adminGiftsMissingLabel,
                    attendance: t.adminGiftsExportAttendance,
                    attendanceAttending: t.adminStatusAttending,
                    attendanceNotAttending: t.adminStatusNotAttending,
                    attendancePending: t.adminRosterPending,
                },
            });
        } catch (exportError) {
            console.error('Failed to export gifts workbook', exportError);
            setError(t.adminGiftsExportError);
        } finally {
            setIsExportingGifts(false);
        }
    };

    // All hooks above must run on every render (Rules of Hooks). Only the
    // JSX we return depends on language/auth state, decided here at the end.
    if (!isValidLang) {
        return <Navigate to="/he/admin" replace />;
    }

    if (!isAuthChecked) {
        return null;
    }

    if (!isSignedIn) {
        return <Navigate to={loginPath} replace />;
    }
    // The `dark` class marks this element as the dark-mode ancestor for
    // every `dark:` utility inside it (see index.css's `@custom-variant
    // dark`), which only matches on DESCENDANTS of `.dark` - a `dark:`
    // utility placed on this same element as the `.dark` class itself never
    // actually applies (there's no element that's a descendant of itself),
    // which is why the background used to stay light in the gaps around the
    // cards. The background color below is therefore chosen directly in JS
    // instead of via a `dark:` utility.
    return (
        <div className={`min-h-screen relative overflow-hidden selection:bg-rose-200 selection:text-rose-900 ${theme === 'dark' ? 'dark bg-slate-950' : 'wedding-silk-background'}`}>
            <div className="absolute inset-0 z-0 wedding-foliage-shadow dark:hidden" aria-hidden="true" />
            <div className="absolute inset-0 z-0 wedding-paper-grain dark:hidden" aria-hidden="true" />

            <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
                <motion.header
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    // z-30 matters here specifically because framer-motion sets an
                    // inline `transform` on this element (for the y-offset
                    // animation), which per the CSS spec makes the header create
                    // its OWN stacking context - so the actions-menu dropdown's
                    // z-20 (scoped inside that context) was being compared against
                    // nothing, and later sibling sections (roster list, etc, which
                    // also get a transform from framer-motion) simply painted over
                    // the whole header in DOM order, hiding the bottom of the open
                    // dropdown. Giving the header itself a z-index lifts its entire
                    // stacking context - dropdown included - above every section
                    // that follows it.
                    className="relative z-30 mb-6 rounded-3xl border border-white/30 bg-white/90 p-6 shadow-xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95"
                >
                    <div className="absolute end-4 top-4" ref={actionsMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsActionsMenuOpen((open) => !open)}
                            aria-haspopup="menu"
                            aria-expanded={isActionsMenuOpen}
                            aria-label={t.adminActionsMenu}
                            title={t.adminActionsMenu}
                            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                                isActionsMenuOpen
                                    ? 'bg-gray-200 text-gray-900 dark:bg-slate-700 dark:text-slate-100'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                            }`}
                        >
                            <MoreVertical size={18} />
                        </button>

                        {isActionsMenuOpen && (
                            <div
                                role="menu"
                                className="absolute end-0 top-11 z-20 w-60 overflow-hidden rounded-2xl border border-gray-100 bg-white py-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                            >
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => { toggleTheme(); setIsActionsMenuOpen(false); }}
                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                    {theme === 'dark' ? <Sun size={16} className="shrink-0 text-gray-400 dark:text-slate-500" /> : <Moon size={16} className="shrink-0 text-gray-400 dark:text-slate-500" />}
                                    {theme === 'dark' ? t.adminThemeToLight : t.adminThemeToDark}
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => { handleRefresh(); setIsActionsMenuOpen(false); }}
                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                    <RefreshCcw size={16} className="shrink-0 text-gray-400 dark:text-slate-500" />
                                    {t.adminRefresh}
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => { handleExport(); setIsActionsMenuOpen(false); }}
                                    disabled={(records.length === 0 && guestRoster.length === 0) || isLoading || isExporting}
                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:text-slate-600"
                                >
                                    {isExporting ? <Loader2 size={16} className="shrink-0 animate-spin text-gray-400" /> : <Download size={16} className="shrink-0 text-gray-400 dark:text-slate-500" />}
                                    {t.adminExportExcel}
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => { handleEnableNotifications(); setIsActionsMenuOpen(false); }}
                                    disabled={notificationsStatus === 'enabling' || notificationsStatus === 'enabled'}
                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:text-slate-600"
                                >
                                    {notificationsStatus === 'enabling' ? <Loader2 size={16} className="shrink-0 animate-spin text-gray-400" /> : <Bell size={16} className="shrink-0 text-gray-400 dark:text-slate-500" />}
                                    {notificationsStatus === 'enabled' ? t.adminNotificationsEnabled : t.adminNotificationsEnable}
                                </button>
                                <div className="my-1.5 border-t border-gray-100 dark:border-slate-700" />
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => { handleLogout(); setIsActionsMenuOpen(false); }}
                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                >
                                    <LogOut size={16} className="shrink-0" />
                                    {t.adminLogout}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* pe-* reserves room for the single actions-menu button
                        in the corner so the title block never runs underneath
                        it on mobile. */}
                    <div className="flex items-center gap-3 pe-14 sm:pe-16">
                        <div className="h-20 w-20 shrink-0 sm:h-28 sm:w-28 lg:h-32 lg:w-32" aria-hidden="true">
                            {/* The source art is a transparent-background monogram, taller than
                                it is wide (420x594) - object-cover in a mismatched box used to
                                crop its sides off. object-contain keeps the whole mark intact,
                                and swapping to the silver version in dark mode keeps it legible
                                against a dark card instead of the gold nearly disappearing. */}
                            <img src={logoSgGold} alt="" className="h-full w-full object-contain dark:hidden" />
                            <img src={logoSgSilver} alt="" className="hidden h-full w-full object-contain dark:block" />
                        </div>
                        <div>
                            <p className={`text-xs font-semibold text-rose-500 ${isRtl ? '' : 'uppercase tracking-wide'}`}>{t.adminDashboardTitle}</p>
                            <h1 className="font-serif text-3xl tracking-tight text-gray-900 sm:text-4xl dark:text-slate-100">חתונת שלי וגיל</h1>
                            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{t.adminDashboardSubtitle}</p>
                        </div>
                    </div>

                    {/* Segmented-pill tab bar - reads as a single grouped
                        control (like a native app's tab switcher) instead of
                        a row of underlined text links, and scales better now
                        that there are five tabs: the active one is a solid
                        "chip", not just a thin line that's easy to miss.
                        Event-day seating staff only ever have the one tab
                        available (see isEventStaff above), so there's
                        nothing to switch between - the whole bar is hidden
                        for them rather than showing four dead buttons. */}
                    {!isEventStaff && (
                    <div className="mt-5 flex flex-wrap gap-1 rounded-2xl bg-gray-100/80 p-1.5 dark:bg-slate-800/60">
                        <button
                            type="button"
                            onClick={() => setActiveTab('roster')}
                            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${displayedTab === 'roster'
                                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                                : 'text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                        >
                            {t.adminRosterTitle}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('responses')}
                            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${displayedTab === 'responses'
                                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                                : 'text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                        >
                            {t.adminTabResponses}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('reminders')}
                            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${displayedTab === 'reminders'
                                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                                : 'text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                        >
                            {t.adminTabReminders}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('seating')}
                            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${displayedTab === 'seating'
                                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                                : 'text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                        >
                            {t.adminTabSeating}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('gifts')}
                            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${displayedTab === 'gifts'
                                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                                : 'text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                        >
                            {t.adminTabGifts}
                        </button>
                    </div>
                    )}
                </motion.header>

                {(notificationsStatus === 'enabled' || notificationsStatus === 'denied' || notificationsStatus === 'unsupported' || notificationsStatus === 'error') && (
                    <div
                        className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
                            notificationsStatus === 'enabled'
                                ? 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                        }`}
                    >
                        {notificationsStatus === 'enabled' && t.adminNotificationsSuccessMessage}
                        {notificationsStatus === 'denied' && t.adminNotificationsDeniedMessage}
                        {notificationsStatus === 'unsupported' && t.adminNotificationsUnsupportedMessage}
                        {notificationsStatus === 'error' && (notificationsErrorMessage || t.adminNotificationsErrorMessage)}
                    </div>
                )}

                {displayedTab === 'roster' && (
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6"
                >
                    <GuestRosterSection
                        entries={guestRoster}
                        isLoading={isLoading}
                        locale={locale}
                        onSync={handleSyncGuestRoster}
                        onResetSide={handleResetGuestRosterSide}
                        onLinkRsvps={handleLinkGuestRosterWithRsvps}
                        onCreate={handleCreateGuestRosterEntry}
                        onUpdate={handleUpdateGuestRosterEntry}
                        onDelete={handleDeleteGuestRosterEntry}
                        labels={{
                            title: t.adminRosterTitle,
                            subtitle: t.adminRosterSubtitle,
                            loading: t.adminRosterLoading,
                            noRecords: t.adminRosterNoRecords,
                            totalInvited: t.adminRosterTotalInvited,
                            confirmed: t.adminRosterConfirmed,
                            declined: t.adminRosterDeclined,
                            pending: t.adminRosterPending,
                            sideBreakdown: t.adminRosterSideBreakdown,
                            categoryBreakdown: t.adminRosterCategoryBreakdown,
                            overallHeading: t.adminRosterOverallHeading,
                            filterHeading: t.adminRosterFilterHeading,
                            side: t.adminRosterSide,
                            category: t.adminRosterCategory,
                            name: t.adminTableName,
                            status: t.adminTableStatus,
                            invitedCount: t.adminRosterInvitedCount,
                            searchPlaceholder: t.adminRosterSearchPlaceholder,
                            allSides: t.adminRosterAllSides,
                            allCategories: t.adminRosterAllCategories,
                            allStatuses: t.adminRosterAllStatuses,
                            statusConfirmed: t.adminStatusAttending,
                            statusDeclined: t.adminStatusNotAttending,
                            statusPending: t.adminRosterPending,
                            actions: t.adminTableActions,
                            deleteAction: t.adminDeleteAction,
                            syncButton: t.adminRosterSyncButton,
                            syncing: t.adminRosterSyncing,
                            syncAdded: t.adminRosterSyncAdded,
                            syncUpdated: t.adminRosterSyncUpdated,
                            syncNone: t.adminRosterSyncNone,
                            syncError: t.adminRosterSyncError,
                            linkButton: t.adminRosterLinkButton,
                            linking: t.adminRosterLinking,
                            linkUpdated: t.adminRosterLinkUpdated,
                            linkNone: t.adminRosterLinkNone,
                            linkAmbiguous: t.adminRosterLinkAmbiguous,
                            linkReverted: t.adminRosterLinkReverted,
                            linkConflict: t.adminRosterLinkConflict,
                            linkError: t.adminRosterLinkError,
                            resetSideButton: t.adminRosterResetSideButton,
                            resettingSide: t.adminRosterResettingSide,
                            resetSideConfirm: t.adminRosterResetSideConfirm,
                            resetSideResult: t.adminRosterResetSideResult,
                            resetSideError: t.adminRosterResetSideError,
                            fullList: t.adminRosterFullList,
                            records: t.adminRosterRecords,
                            addGuest: t.adminRosterAddGuest,
                            firstName: t.adminRosterFirstName,
                            lastName: t.adminRosterLastName,
                            addSubmit: t.adminRosterAddSubmit,
                            cancel: t.adminGroupCancel,
                            saving: t.adminGroupSaving,
                            deleteConfirm: t.adminRosterDeleteConfirm,
                            deleteError: t.adminRosterDeleteError,
                            updateError: t.adminRosterUpdateError,
                            createError: t.adminRosterCreateError,
                            requiredName: t.adminRosterRequiredName,
                            statusLinkedHint: t.adminRosterStatusLinkedHint,
                        }}
                    />
                </motion.section>
                )}

                {displayedTab === 'roster' && (
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="mb-6"
                >
                    <OldSiteRsvpImportPanel entries={guestRoster} onApplied={reloadGuestRoster} />
                </motion.section>
                )}

                {displayedTab === 'roster' && (
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    className="mb-6"
                >
                    <DuplicateFinderPanel entries={guestRoster} onDelete={handleDeleteGuestRosterEntry} />
                </motion.section>
                )}

                {displayedTab === 'responses' && (
                <>
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
                >
                    <article className="rounded-2xl border border-white/30 bg-white/90 p-3.5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
                        <div className="mb-1.5 flex items-center gap-1.5 text-gray-500 dark:text-slate-400">
                            <Users size={14} className="shrink-0" />
                            <span className="truncate text-xs font-medium">{t.adminTotalSubmissions}</span>
                        </div>
                        <p dir="ltr" className="text-2xl font-semibold text-gray-900 dark:text-slate-100">{records.length}</p>
                    </article>

                    <article className="rounded-2xl border border-white/30 bg-white/90 p-3.5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
                        <div className="mb-1.5 flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <UserCheck size={14} className="shrink-0" />
                            <span className="truncate text-xs font-medium">{t.adminAttendingCount}</span>
                        </div>
                        <p dir="ltr" className="text-2xl font-semibold text-gray-900 dark:text-slate-100">{attendingCount}</p>
                    </article>

                    <article className="rounded-2xl border border-white/30 bg-white/90 p-3.5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
                        <div className="mb-1.5 flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                            <UserX size={14} className="shrink-0" />
                            <span className="truncate text-xs font-medium">{t.adminNotAttendingCount}</span>
                        </div>
                        <p dir="ltr" className="text-2xl font-semibold text-gray-900 dark:text-slate-100">{notAttendingCount}</p>
                    </article>

                    <article className="rounded-2xl border border-white/30 bg-white/90 p-3.5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
                        <div className="mb-1.5 flex items-center gap-1.5 text-gray-500 dark:text-slate-400">
                            <Languages size={14} className="shrink-0" />
                            <span className="truncate text-xs font-medium">{t.adminLanguageBreakdown}</span>
                        </div>
                        <p dir="ltr" className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                            HE {languageBreakdown.he} · EN {languageBreakdown.en} · FR {languageBreakdown.fr}
                        </p>
                    </article>
                </motion.section>

                {SHOW_INVITE_LINK_VISITS && (
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.07 }}
                    className="order-1 mb-6"
                >
                    <InviteLinkVisitsTable
                        visits={pendingInviteLinkVisits}
                        rsvpStatusByPhone={rsvpStatusByPhone}
                        formatDate={formatDate}
                        isLoading={isLoading}
                        deletingVisitId={deletingInviteLinkVisitId}
                        onDelete={handleDeleteInviteLinkVisit}
                        labels={{
                            title: t.adminInviteLinksTitle,
                            subtitle: t.adminInviteLinksSubtitle,
                            name: t.adminTableName,
                            group: t.adminTableGroup,
                            phone: t.adminTablePhone,
                            status: t.adminTableStatus,
                            language: t.adminTableLanguage,
                            openedAt: t.adminInviteLinkOpenedAt,
                            actions: t.adminTableActions,
                            loading: t.adminLoading,
                            noRecords: t.adminInviteLinksNoRecords,
                            attending: t.adminStatusAttending,
                            notAttending: t.adminStatusNotAttending,
                            pending: t.adminInviteLinkNoRsvp,
                            unknownName: t.adminUnknownName,
                            unassignedGroup: t.adminGroupUnassigned,
                            deleteAction: t.adminDeleteAction,
                            deletingAction: t.adminDeletingAction,
                        }}
                    />
                </motion.section>
                )}

                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    className="order-3 mb-6 grid gap-4 xl:grid-cols-2"
                >
                    <article className="rounded-3xl border border-white/30 bg-white/95 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95">
                        <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-slate-300">{t.adminChartFunnelTitle}</h3>
                        <div className="space-y-3">
                            {funnelSteps.map((step) => (
                                <div key={step.label}>
                                    <div className="mb-1 flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
                                        <span>{step.label}</span>
                                        <span dir="ltr" className="font-semibold text-gray-900 dark:text-slate-100">{step.value}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800">
                                        <div className="h-2 rounded-full bg-gray-900/70 dark:bg-slate-200/70" style={{ width: `${step.percent}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-3xl border border-white/30 bg-white/95 p-4 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t.adminChartLanguageAttendanceTitle}</h3>
                            <div className="flex shrink-0 items-center gap-2.5 text-[11px] text-gray-500 dark:text-slate-400">
                                <span className="inline-flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                    {t.adminChartLegendAttending}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-300" />
                                    {t.adminChartLegendNotAttending}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-1.5" dir="ltr">
                            {languageAttendanceData.map((item) => (
                                <div key={item.label} className="flex items-center gap-2">
                                    <span className="w-6 shrink-0 text-xs text-gray-600 dark:text-slate-400">{item.label}</span>
                                    <div className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                                        <div
                                            className="h-full bg-emerald-400"
                                            style={{ width: `${(item.attending / maxLanguageAttendance) * 100}%` }}
                                        />
                                        <div
                                            className="h-full bg-rose-300"
                                            style={{ width: `${(item.notAttending / maxLanguageAttendance) * 100}%` }}
                                        />
                                    </div>
                                    <span className="w-5 shrink-0 text-end text-xs font-semibold text-gray-900 dark:text-slate-100">{item.total}</span>
                                </div>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-3xl border border-white/30 bg-white/95 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95">
                        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-slate-300">{t.adminChartResponsesTimelineTitle}</h3>
                        {peakResponseHour.count === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-slate-400">{t.adminChartNoData}</p>
                        ) : (
                            <div dir="ltr">
                                <svg
                                    viewBox={`0 0 ${TREND_CHART_WIDTH} ${TREND_CHART_HEIGHT}`}
                                    className="h-40 w-full cursor-crosshair"
                                    onMouseMove={(event) => {
                                        const transformationMatrix = event.currentTarget.getScreenCTM();
                                        if (!transformationMatrix) {
                                            return;
                                        }

                                        const pointer = event.currentTarget.createSVGPoint();
                                        pointer.x = event.clientX;
                                        pointer.y = event.clientY;
                                        const chartPointer = pointer.matrixTransform(transformationMatrix.inverse());
                                        const chartWidth = TREND_CHART_WIDTH - TREND_CHART_PADDING * 2;
                                        const relativeX = (chartPointer.x - TREND_CHART_PADDING) / chartWidth;
                                        const nearestHour = Math.round(Math.min(Math.max(relativeX, 0), 1) * 23);
                                        setActiveResponseHour(nearestHour);
                                    }}
                                    onMouseLeave={() => setActiveResponseHour(null)}
                                >
                                    <line
                                        x1={TREND_CHART_PADDING}
                                        y1={TREND_CHART_HEIGHT - TREND_CHART_PADDING}
                                        x2={TREND_CHART_WIDTH - TREND_CHART_PADDING}
                                        y2={TREND_CHART_HEIGHT - TREND_CHART_PADDING}
                                        className="stroke-gray-200 dark:stroke-slate-700"
                                        strokeWidth="1"
                                    />
                                    <polyline fill="none" className="stroke-gray-900 dark:stroke-slate-100" strokeWidth="3" points={hourlyPolylinePoints} />
                                    {hourlyChartPoints.map((point, hour) => (
                                        <g key={hour}>
                                            <circle
                                                cx={point.x}
                                                cy={point.y}
                                                r={hour === peakResponseHour.hour ? 4.5 : 2}
                                                className={hour === peakResponseHour.hour ? 'fill-rose-600 dark:fill-rose-400' : 'fill-gray-900 dark:fill-slate-100'}
                                                pointerEvents="none"
                                            />
                                            <circle
                                                cx={point.x}
                                                cy={point.y}
                                                r="9"
                                                fill="transparent"
                                                className="cursor-crosshair outline-none"
                                                tabIndex={0}
                                                aria-label={`${String(hour).padStart(2, '0')}:00, ${hourlyResponses[hour]}`}
                                                onFocus={() => setActiveResponseHour(hour)}
                                                onBlur={() => setActiveResponseHour(null)}
                                            />
                                        </g>
                                    ))}
                                    {activeResponseHour !== null && (() => {
                                        const point = hourlyChartPoints[activeResponseHour];
                                        const tooltipX = Math.min(Math.max(point.x - 40, 2), TREND_CHART_WIDTH - 82);
                                        const tooltipY = Math.max(point.y - 28, 4);

                                        return (
                                            <g pointerEvents="none">
                                                <rect
                                                    x={tooltipX}
                                                    y={tooltipY}
                                                    width="80"
                                                    height="22"
                                                    rx="6"
                                                    className="fill-gray-900 dark:fill-slate-100"
                                                />
                                                <text
                                                    x={tooltipX + 40}
                                                    y={tooltipY + 15}
                                                    className="fill-white dark:fill-slate-900"
                                                    fontSize="10"
                                                    fontWeight="600"
                                                    textAnchor="middle"
                                                >
                                                    {`${String(activeResponseHour).padStart(2, '0')}:00 · ${hourlyResponses[activeResponseHour]}`}
                                                </text>
                                            </g>
                                        );
                                    })()}
                                </svg>
                                <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                                    {[0, 6, 12, 18, 23].map((hour) => (
                                        <span key={hour}>{String(hour).padStart(2, '0')}:00</span>
                                    ))}
                                </div>
                                <p className="mt-3 text-center text-xs font-medium text-rose-600 dark:text-rose-400">
                                    {t.adminChartPeakHour}: {String(peakResponseHour.hour).padStart(2, '0')}:00 ({peakResponseHour.count})
                                </p>
                            </div>
                        )}
                    </article>

                    <article className="rounded-3xl border border-white/30 bg-white/95 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95">
                        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-slate-300">{t.adminChartSeatsTimelineTitle}</h3>
                        {groupDistributionData.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-slate-400">{t.adminChartNoData}</p>
                        ) : (
                            <div className="max-h-48 space-y-3 overflow-y-auto pe-1">
                                {groupDistributionData.map((group) => (
                                    <div key={group.label}>
                                        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                                            <span className="truncate text-gray-600 dark:text-slate-400" title={group.label}>{group.label}</span>
                                            <span className="shrink-0 font-semibold text-gray-900 dark:text-slate-100" dir="ltr">{group.count}</span>
                                        </div>
                                        <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                                            <div
                                                className="h-full rounded-full bg-blue-600"
                                                style={{ width: `${(group.count / maxGroupCount) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </article>

                    <article className="rounded-3xl border border-white/30 bg-white/95 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95">
                        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-slate-300">{t.adminChartGuestsDistributionTitle}</h3>
                        {guestsDistributionData.every((bucket) => bucket.count === 0) ? (
                            <p className="text-sm text-gray-500 dark:text-slate-400">{t.adminChartNoData}</p>
                        ) : (
                            <div className="mt-3 flex items-end gap-3" dir="ltr">
                                {guestsDistributionData.map((bucket) => (
                                    <div key={bucket.label} className="flex flex-1 flex-col items-center gap-1">
                                        <div
                                            className="w-full max-w-16 rounded-t-xl bg-gray-900/70 dark:bg-slate-200/70"
                                            style={{
                                                height: `${Math.max((bucket.count / maxGuestsDistribution) * 120, bucket.count > 0 ? 10 : 2)}px`,
                                            }}
                                        />
                                        <span className="text-xs text-gray-600 dark:text-slate-400">{bucket.label}</span>
                                        <span dir="ltr" className="text-xs font-semibold text-gray-900 dark:text-slate-100">{bucket.count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </article>
                </motion.section>

                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="order-2 mb-6 overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95"
                >
                    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3 dark:border-slate-700">
                        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs sm:flex-none">
                            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={responseSearchTerm}
                                onChange={(event) => setResponseSearchTerm(event.target.value)}
                                placeholder={t.adminResponseSearchPlaceholder}
                                className="w-full rounded-full border border-gray-200 bg-white py-1.5 ps-8 pe-3 text-xs text-gray-700 outline-none focus:border-gray-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            />
                        </div>
                        {responseSearchTerm.trim() !== '' && (
                            <span className="text-xs text-gray-500 dark:text-slate-400">
                                {visibleSortedRecords.length} {t.adminResponseSearchResultsCount}
                            </span>
                        )}
                    </div>
                    {selectedIds.length > 0 && (
                        <div className="flex items-center justify-between gap-3 border-b border-rose-100 bg-rose-50 px-5 py-2.5 dark:border-rose-900/40 dark:bg-rose-950/40">
                            <span className="text-sm font-medium text-rose-700 dark:text-rose-300">{selectedIds.length} {t.adminSelectedCount}</span>
                            <button
                                type="button"
                                onClick={handleDeleteSelected}
                                disabled={isDeletingSelected}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-200 disabled:opacity-60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40"
                            >
                                <Trash2 size={14} />
                                {isDeletingSelected ? t.adminDeletingSelectedAction : t.adminDeleteSelectedAction}
                            </button>
                        </div>
                    )}
                    {isLoading ? (
                        <div className="flex items-center justify-center gap-3 p-10 text-gray-600 dark:text-slate-400">
                            <span className="h-5 w-5 rounded-full border-2 border-gray-200 border-t-gray-700 animate-spin dark:border-slate-700 dark:border-t-slate-300" />
                            <span>{t.adminLoading}</span>
                        </div>
                    ) : error ? (
                        <div className="p-6 text-center text-rose-600 dark:text-rose-400">{error}</div>
                    ) : records.length === 0 ? (
                        <div className="p-8 text-center text-gray-600 dark:text-slate-400">{t.adminNoRecords}</div>
                    ) : visibleSortedRecords.length === 0 ? (
                        <div className="p-8 text-center text-gray-600 dark:text-slate-400">{t.adminResponseSearchNoResults}</div>
                    ) : (
                        <>
                        {/* Mobile card list (below md breakpoint) */}
                        <div className="divide-y divide-gray-100 md:hidden dark:divide-slate-700">
                            {visibleSortedRecords.map((record, index) => {
                                const isExpanded = expandedRecordIds.has(record.id);
                                return (
                                <div key={record.id} className="p-3">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(record.id)}
                                            onChange={() => handleToggleRecordSelection(record.id)}
                                            disabled={isDeletingSelected || deletingId === record.id}
                                            aria-label={t.adminSelectRow}
                                            className="h-4 w-4 shrink-0 rounded border-gray-300 text-gray-900 focus:ring-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => toggleRecordExpanded(record.id)}
                                            className="flex min-w-0 flex-1 items-center gap-2 text-start"
                                            aria-expanded={isExpanded}
                                        >
                                            <ChevronDown
                                                size={16}
                                                className={`shrink-0 text-gray-400 transition-transform dark:text-slate-500 ${isExpanded ? 'rotate-180' : ''}`}
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-medium text-gray-900 dark:text-slate-100">
                                                    <span className="text-gray-400 me-1 dark:text-slate-500" dir="ltr">#{index + 1}</span>
                                                    {record.fullName || t.adminUnknownName}
                                                </span>
                                                <span className="mt-0.5 block">
                                                    <RosterMatchBadge
                                                        info={rosterMatchInfoByRecordId.get(record.id) ?? { status: 'empty', label: '-', isManual: false, candidates: [] }}
                                                        manualLabel={t.adminManualMatchBadge}
                                                    />
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-slate-400" dir="ltr">×{record.guestsCount}</span>
                                            {record.attendanceSetByAdmin && (
                                                <Pencil
                                                    size={12}
                                                    className="shrink-0 text-gray-400 dark:text-slate-500"
                                                    aria-label={t.adminAttendanceSetByAdminHint}
                                                    title={t.adminAttendanceSetByAdminHint}
                                                />
                                            )}
                                            <span
                                                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${record.isAttending
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                                    }`}
                                            >
                                                {record.isAttending ? t.adminStatusAttending : t.adminStatusNotAttending}
                                            </span>
                                        </button>
                                    </div>

                                    {isExpanded && (
                                    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-slate-700">
                                        <p className="text-xs text-gray-500 dark:text-slate-400" dir="ltr">{record.phone || t.adminNoPhone}</p>

                                        <div className="mt-3 grid grid-cols-2 gap-3">
                                            <div className="col-span-2">
                                                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">{t.adminTableName}</p>
                                                <EditableTextField
                                                    value={record.fullName}
                                                    disabled={isDeletingSelected || deletingId === record.id}
                                                    inputLabel={t.adminTableName}
                                                    saveLabel={t.adminGroupSave}
                                                    savingLabel={t.adminGroupSaving}
                                                    placeholder={t.adminUnknownName}
                                                    onChange={(fullName) => handleFullNameChange(record.id, fullName)}
                                                />
                                            </div>
                                            <div>
                                                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">{t.adminTableGuests}</p>
                                                <GuestCountInput
                                                    count={record.guestsCount}
                                                    disabled={isDeletingSelected || deletingId === record.id}
                                                    inputLabel={t.adminTableGuests}
                                                    saveLabel={t.adminGroupSave}
                                                    savingLabel={t.adminGroupSaving}
                                                    onChange={(guestsCount) => handleGuestCountChange(record.id, guestsCount)}
                                                />
                                            </div>
                                            <div>
                                                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">{t.adminTableStatus}</p>
                                                <div className="flex gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAttendanceChange(record.id, true)}
                                                        disabled={isDeletingSelected || deletingId === record.id || updatingAttendanceId === record.id || record.isAttending}
                                                        className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${record.isAttending
                                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                                                            }`}
                                                    >
                                                        {t.adminStatusAttending}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAttendanceChange(record.id, false)}
                                                        disabled={isDeletingSelected || deletingId === record.id || updatingAttendanceId === record.id || !record.isAttending}
                                                        className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${!record.isAttending
                                                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                                                            }`}
                                                    >
                                                        {t.adminStatusNotAttending}
                                                    </button>
                                                </div>
                                                {record.attendanceSetByAdmin && (
                                                    <p className="mt-1 flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                                                        <Pencil size={11} className="shrink-0" />
                                                        {t.adminAttendanceSetByAdminHint}
                                                    </p>
                                                )}
                                            </div>
                                            <div>
                                                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">{t.adminTableGroup}</p>
                                                <GuestGroupSelect
                                                    group={record.group}
                                                    groups={guestGroups}
                                                    disabled={isDeletingSelected || deletingId === record.id}
                                                    onChange={(group) => handleGroupChange(record.id, group)}
                                                    labels={{
                                                        unassigned: t.adminGroupUnassigned,
                                                        addNew: t.adminGroupAddNew,
                                                        newGroupPlaceholder: t.adminGroupNamePlaceholder,
                                                        save: t.adminGroupSave,
                                                        cancel: t.adminGroupCancel,
                                                        saving: t.adminGroupSaving,
                                                    }}
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">{t.adminTableSideCategory}</p>
                                                <RosterMatchPicker
                                                    record={record}
                                                    info={rosterMatchInfoByRecordId.get(record.id) ?? { status: 'empty', label: '-', isManual: false, candidates: [] }}
                                                    guestRoster={guestRoster}
                                                    instructions={t.adminManualMatchInstructions}
                                                    clearLabel={t.adminManualMatchClear}
                                                    foundMatchesLabel={t.adminManualMatchFoundGroup}
                                                    fullListLabel={t.adminManualMatchFullListGroup}
                                                    showFullListLabel={t.adminManualMatchShowFullList}
                                                    toggleLabel={t.adminManualMatchToggle}
                                                    onChange={handleManualRosterMatchChange}
                                                />
                                            </div>
                                        </div>

                                        {record.note && (
                                            <p className="mt-3 rounded-xl bg-gray-50 p-2.5 text-sm text-gray-700 dark:bg-slate-800 dark:text-slate-300">{record.note}</p>
                                        )}

                                        <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                                            <span dir="ltr">{record.lang.toUpperCase()}</span>
                                            <span dir="ltr">{formatDate(record.createdAt)}</span>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleDelete(record.id)}
                                            disabled={deletingId === record.id || isDeletingSelected}
                                            className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${deletingId === record.id || isDeletingSelected
                                                ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-600'
                                                : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40'
                                                }`}
                                        >
                                            <Trash2 size={14} />
                                            {deletingId === record.id ? t.adminDeletingAction : t.adminDeleteAction}
                                        </button>
                                    </div>
                                    )}
                                </div>
                                );
                            })}
                        </div>

                        {/* Desktop table (md breakpoint and up) */}
                        <div className="hidden overflow-x-auto md:block">
                            <table className="min-w-[1600px] table-fixed divide-y divide-gray-200 text-sm dark:divide-slate-700">
                                <thead className="bg-gray-50/80 text-gray-600 dark:bg-slate-800/60 dark:text-slate-400">
                                    <tr>
                                        <th className="w-24 px-4 py-3 text-start font-semibold">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={isAllSelected}
                                                    onChange={handleToggleAllSelection}
                                                    disabled={isDeletingSelected || deletingId !== null}
                                                    aria-label={t.adminSelectAllRows}
                                                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                                                />
                                                <span>{t.adminTableSelect}</span>
                                            </div>
                                        </th>
                                        <th className="w-20 px-4 py-3 text-center font-semibold">{t.adminTableIndex}</th>
                                        <SortableHeader
                                            className="w-56 text-start"
                                            label={t.adminTableName}
                                            sortKey="fullName"
                                            activeSort={sortConfig}
                                            onSort={handleSort}
                                        />
                                        <th className="w-40 px-4 py-3 text-center font-semibold">{t.adminTablePhone}</th>
                                        <SortableHeader
                                            className="w-40 text-center"
                                            label={t.adminTableGuests}
                                            sortKey="guestsCount"
                                            activeSort={sortConfig}
                                            onSort={handleSort}
                                        />
                                        <SortableHeader
                                            className="w-52 text-start"
                                            label={t.adminTableGroup}
                                            sortKey="group"
                                            activeSort={sortConfig}
                                            onSort={handleSort}
                                        />
                                        <th className="w-40 px-4 py-3 text-start font-semibold">{t.adminTableSideCategory}</th>
                                        <SortableHeader
                                            className="w-36 text-start"
                                            label={t.adminTableStatus}
                                            sortKey="isAttending"
                                            activeSort={sortConfig}
                                            onSort={handleSort}
                                        />
                                        <SortableHeader
                                            className="w-24 text-center"
                                            label={t.adminTableLanguage}
                                            sortKey="lang"
                                            activeSort={sortConfig}
                                            onSort={handleSort}
                                        />
                                        <SortableHeader
                                            className="w-44 text-center whitespace-nowrap"
                                            label={t.adminTableSubmittedAt}
                                            sortKey="createdAt"
                                            activeSort={sortConfig}
                                            onSort={handleSort}
                                        />
                                        <th className="w-32 px-4 py-3 text-start font-semibold">{t.adminTableActions}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white dark:divide-slate-700 dark:bg-slate-900">
                                    {visibleSortedRecords.map((record, index) => (
                                        <tr key={record.id} className="align-top">
                                            <td className="w-24 px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(record.id)}
                                                    onChange={() => handleToggleRecordSelection(record.id)}
                                                    disabled={isDeletingSelected || deletingId === record.id}
                                                    aria-label={t.adminSelectRow}
                                                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                                                />
                                            </td>
                                            <td className="w-20 px-4 py-3 text-center text-gray-700 dark:text-slate-300" dir="ltr">{index + 1}</td>
                                            <td className="w-48 px-4 py-3 font-medium text-gray-900 dark:text-slate-100">
                                                <EditableTextField
                                                    value={record.fullName}
                                                    disabled={isDeletingSelected || deletingId === record.id}
                                                    inputLabel={t.adminTableName}
                                                    saveLabel={t.adminGroupSave}
                                                    savingLabel={t.adminGroupSaving}
                                                    placeholder={t.adminUnknownName}
                                                    onChange={(fullName) => handleFullNameChange(record.id, fullName)}
                                                />
                                            </td>
                                            <td className="w-40 px-4 py-3 text-center text-gray-700 whitespace-nowrap dark:text-slate-300" dir="ltr">{record.phone || t.adminNoPhone}</td>
                                            <td className="w-40 px-4 py-3 text-center text-gray-700 dark:text-slate-300">
                                                <GuestCountInput
                                                    count={record.guestsCount}
                                                    disabled={isDeletingSelected || deletingId === record.id}
                                                    inputLabel={t.adminTableGuests}
                                                    saveLabel={t.adminGroupSave}
                                                    savingLabel={t.adminGroupSaving}
                                                    onChange={(guestsCount) => handleGuestCountChange(record.id, guestsCount)}
                                                />
                                            </td>
                                            <td className="w-52 px-4 py-3">
                                                <GuestGroupSelect
                                                    group={record.group}
                                                    groups={guestGroups}
                                                    disabled={isDeletingSelected || deletingId === record.id}
                                                    onChange={(group) => handleGroupChange(record.id, group)}
                                                    labels={{
                                                        unassigned: t.adminGroupUnassigned,
                                                        addNew: t.adminGroupAddNew,
                                                        newGroupPlaceholder: t.adminGroupNamePlaceholder,
                                                        save: t.adminGroupSave,
                                                        cancel: t.adminGroupCancel,
                                                        saving: t.adminGroupSaving,
                                                    }}
                                                />
                                            </td>
                                            <td className="w-40 px-4 py-3 text-gray-700 dark:text-slate-300">
                                                <RosterMatchBadge
                                                    info={rosterMatchInfoByRecordId.get(record.id) ?? { status: 'empty', label: '-', isManual: false, candidates: [] }}
                                                    manualLabel={t.adminManualMatchBadge}
                                                />
                                                <RosterMatchPicker
                                                    record={record}
                                                    info={rosterMatchInfoByRecordId.get(record.id) ?? { status: 'empty', label: '-', isManual: false, candidates: [] }}
                                                    guestRoster={guestRoster}
                                                    instructions={t.adminManualMatchInstructions}
                                                    clearLabel={t.adminManualMatchClear}
                                                    foundMatchesLabel={t.adminManualMatchFoundGroup}
                                                    fullListLabel={t.adminManualMatchFullListGroup}
                                                    showFullListLabel={t.adminManualMatchShowFullList}
                                                    toggleLabel={t.adminManualMatchToggle}
                                                    onChange={handleManualRosterMatchChange}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="inline-flex gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAttendanceChange(record.id, true)}
                                                        disabled={isDeletingSelected || deletingId === record.id || updatingAttendanceId === record.id || record.isAttending}
                                                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${record.isAttending
                                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                                                            }`}
                                                    >
                                                        {t.adminStatusAttending}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAttendanceChange(record.id, false)}
                                                        disabled={isDeletingSelected || deletingId === record.id || updatingAttendanceId === record.id || !record.isAttending}
                                                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${!record.isAttending
                                                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                                                            }`}
                                                    >
                                                        {t.adminStatusNotAttending}
                                                    </button>
                                                </div>
                                                {record.attendanceSetByAdmin && (
                                                    <p className="mt-1 flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                                                        <Pencil size={11} className="shrink-0" />
                                                        {t.adminAttendanceSetByAdminHint}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="w-24 px-4 py-3 text-center text-gray-700 dark:text-slate-300" dir="ltr">{record.lang}</td>
                                            <td className="w-44 px-4 py-3 text-center text-gray-700 whitespace-nowrap dark:text-slate-300" dir="ltr">{formatDate(record.createdAt)}</td>
                                            <td className="w-32 px-4 py-3">
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(record.id)}
                                                    disabled={deletingId === record.id || isDeletingSelected}
                                                    className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${deletingId === record.id || isDeletingSelected
                                                        ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-600'
                                                        : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40'
                                                        }`}
                                                >
                                                    <Trash2 size={14} />
                                                    {deletingId === record.id ? t.adminDeletingAction : t.adminDeleteAction}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        </>
                    )}
                </motion.section>
                </>
                )}

                {displayedTab === 'reminders' && (
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6"
                >
                    <WhatsappReminders
                        baseList={baseList}
                        respondedPhones={respondedPhones}
                        isLoading={isLoadingBaseList}
                        onSync={handleSyncBaseList}
                        missingPhoneGuests={rosterEntriesMissingPhone}
                        onUpdateGuestName={handleUpdateBaseListGuestName}
                        onAddPhone={handleAddBaseListPhone}
                        labels={{
                            title: t.adminRemindersTitle,
                            subtitle: t.adminRemindersSubtitle,
                            loading: t.adminRemindersLoading,
                            noGuests: t.adminRemindersNoGuests,
                            templateLabel: t.adminRemindersTemplateLabel,
                            templateHelp: t.adminRemindersTemplateHelp,
                            templateDefault: t.adminRemindersTemplateDefault,
                            previewLabel: t.adminRemindersPreviewLabel,
                            tip: t.adminRemindersTip,
                            searchPlaceholder: t.adminRemindersSearchPlaceholder,
                            filterAll: t.adminRemindersFilterAll,
                            filterPending: t.adminRemindersFilterPending,
                            alreadyResponded: t.adminRemindersAlreadyResponded,
                            sendButton: t.adminRemindersSendButton,
                            countLabel: t.adminRemindersCountLabel,
                            selectedTitle: t.adminRemindersSelectedTitle,
                            selectedHelp: t.adminRemindersSelectedHelp,
                            clearSelection: t.adminRemindersClearSelection,
                            groupFilterAll: t.adminRemindersGroupFilterAll,
                            selectAllVisible: t.adminRemindersSelectAllVisible,
                            deselectAllVisible: t.adminRemindersDeselectAllVisible,
                            syncButton: t.adminRemindersSyncButton,
                            syncing: t.adminRemindersSyncing,
                            syncUpserted: t.adminRemindersSyncUpserted,
                            syncSkipped: t.adminRemindersSyncSkipped,
                            syncNone: t.adminRemindersSyncNone,
                            syncError: t.adminRemindersSyncError,
                            openAllButton: t.adminRemindersOpenAllButton,
                            openAllHelp: t.adminRemindersOpenAllHelp,
                            openAllMobileNote: t.adminRemindersOpenAllMobileNote,
                            missingPhoneHeading: t.adminRemindersMissingPhoneHeading,
                            missingPhoneHint: t.adminRemindersMissingPhoneHint,
                            suspiciousCharsWarning: t.adminRemindersSuspiciousCharsWarning,
                            removeSuspiciousCharsButton: t.adminRemindersRemoveSuspiciousCharsButton,
                            editNameButton: t.adminRemindersEditNameButton,
                            editNamePlaceholder: t.adminRemindersEditNamePlaceholder,
                            saveEditButton: t.adminRemindersSaveEditButton,
                            editNameError: t.adminRemindersEditNameError,
                            addPhoneButton: t.adminRemindersAddPhoneButton,
                            addPhonePlaceholder: t.adminRemindersAddPhonePlaceholder,
                            savePhoneButton: t.adminRemindersSavePhoneButton,
                            addPhoneError: t.adminRemindersAddPhoneError,
                            addPhoneInvalid: t.adminRemindersAddPhoneInvalid,
                        }}
                    />
                </motion.section>
                )}

                {displayedTab === 'seating' && (
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6"
                >
                    <SeatingSection
                        confirmedEntries={confirmedRosterEntries}
                        allEntries={guestRoster}
                        tables={seatingTables}
                        venueObjects={venueObjects}
                        groups={seatingGroups}
                        assignments={seatingAssignments}
                        alerts={seatingAlerts}
                        layoutLocked={seatingLayoutLocked}
                        onToggleLayoutLock={handleToggleSeatingLayoutLock}
                        isLoading={isLoadingSeating}
                        locale={locale}
                        onCreateTable={handleCreateSeatingTable}
                        onUpdateTable={handleUpdateSeatingTable}
                        onUpdateTableLayout={handleUpdateSeatingTableLayout}
                        onDeleteTable={handleDeleteSeatingTable}
                        onCreateObject={handleCreateVenueObject}
                        onUpdateObject={handleUpdateVenueObject}
                        onUpdateObjectLayout={handleUpdateVenueObjectLayout}
                        onDeleteObject={handleDeleteVenueObject}
                        onCreateGroup={handleCreateSeatingGroup}
                        onUpdateGroup={handleUpdateSeatingGroup}
                        onDeleteGroup={handleDeleteSeatingGroup}
                        onSetAssignment={handleSetSeatingAssignment}
                        onRemoveAssignment={handleRemoveSeatingAssignment}
                        onAssignGroupToTable={handleAssignSeatingGroupToTable}
                        onGenerateVenueTables={handleGenerateVenueTables}
                        onDismissAlert={handleDismissSeatingAlert}
                        labels={{
                            title: t.adminSeatingTitle,
                            subtitle: t.adminSeatingSubtitle,
                            loading: t.adminSeatingLoading,
                            statConfirmed: t.adminSeatingStatConfirmed,
                            statSeated: t.adminSeatingStatSeated,
                            statUnseated: t.adminSeatingStatUnseated,
                            statTables: t.adminSeatingStatTables,
                            statSeatsAvailable: t.adminSeatingStatSeatsAvailable,
                            unseatedHeading: t.adminSeatingUnseatedHeading,
                            unseatedEmpty: t.adminSeatingUnseatedEmpty,
                            unseatedAllSeated: t.adminSeatingUnseatedAllSeated,
                            searchPlaceholder: t.adminSeatingSearchPlaceholder,
                            remainingOf: t.adminSeatingRemainingOf,
                            seatsWord: t.adminSeatingSeatsWord,
                            chooseTable: t.adminSeatingChooseTable,
                            addButton: t.adminSeatingAddButton,
                            noTablesHint: t.adminSeatingNoTablesHint,
                            groupsHeading: t.adminSeatingGroupsHeading,
                            addGroupButton: t.adminSeatingAddGroupButton,
                            groupNamePlaceholder: t.adminSeatingGroupNamePlaceholder,
                            groupMembersHint: t.adminSeatingGroupMembersHint,
                            saveGroup: t.adminSeatingSaveGroup,
                            cancelAction: t.adminSeatingCancelAction,
                            editAction: t.adminSeatingEditAction,
                            deleteAction: t.adminSeatingDeleteAction,
                            assignButton: t.adminSeatingAssignButton,
                            noGroups: t.adminSeatingNoGroups,
                            membersCountLabel: t.adminSeatingMembersCountLabel,
                            tablesHeading: t.adminSeatingTablesHeading,
                            addTableButton: t.adminSeatingAddTableButton,
                            tableNamePlaceholder: t.adminSeatingTableNamePlaceholder,
                            tableSeatsPlaceholder: t.adminSeatingTableSeatsPlaceholder,
                            saveTable: t.adminSeatingSaveTable,
                            noTables: t.adminSeatingNoTables,
                            tableFullBadge: t.adminSeatingTableFullBadge,
                            canvasHint: t.adminSeatingCanvasHint,
                            shapeRound: t.adminSeatingShapeRound,
                            shapeRect: t.adminSeatingShapeRect,
                            shapeTeardrop: t.adminSeatingShapeTeardrop,
                            shapeCurved: t.adminSeatingShapeCurved,
                            rotateTableButton: t.adminSeatingRotateTableButton,
                            tableDetailsHint: t.adminSeatingTableDetailsHint,
                            deleteTableConfirm: t.adminSeatingDeleteTableConfirm,
                            deleteGroupConfirm: t.adminSeatingDeleteGroupConfirm,
                            updateError: t.adminSeatingUpdateError,
                            createError: t.adminSeatingCreateError,
                            deleteError: t.adminSeatingDeleteError,
                            saving: t.adminSeatingSaving,
                            zoomOutLabel: t.adminSeatingZoomOut,
                            zoomInLabel: t.adminSeatingZoomIn,
                            zoomResetLabel: t.adminSeatingZoomReset,
                            enterFullScreenLabel: t.adminSeatingEnterFullScreen,
                            exitFullScreenLabel: t.adminSeatingExitFullScreen,
                            exportListButton: t.adminSeatingExportListButton,
                            exportImageButton: t.adminSeatingExportImageButton,
                            fullListSheet: t.adminSeatingFullListSheet,
                            exportLanguageLabel: t.adminSeatingExportLanguageLabel,
                            exportLanguageOriginal: t.adminSeatingExportLanguageOriginal,
                            exportLanguageEnglish: t.adminSeatingExportLanguageEnglish,
                            exportError: t.adminSeatingExportError,
                            exportGuestColumn: t.adminSeatingExportGuestColumn,
                            exportCategoryColumn: t.adminSeatingExportCategoryColumn,
                            exportSeatsColumn: t.adminSeatingExportSeatsColumn,
                            exportRemainingColumn: t.adminSeatingExportRemainingColumn,
                            exportOccupiedLabel: t.adminSeatingExportOccupiedLabel,
                            generateFromSketchButton: t.adminSeatingGenerateFromSketchButton,
                            generateFromSketchConfirm: t.adminSeatingGenerateFromSketchConfirm,
                            generateFromSketchError: t.adminSeatingGenerateFromSketchError,
                            viewToggleMap: t.adminSeatingViewToggleMap,
                            viewToggleList: t.adminSeatingViewToggleList,
                            listSearchPlaceholder: t.adminSeatingListSearchPlaceholder,
                            listTableFilterAll: t.adminSeatingListTableFilterAll,
                            listStatusFilterAll: t.adminSeatingListStatusFilterAll,
                            listStatusFilterSeated: t.adminSeatingListStatusFilterSeated,
                            listStatusFilterPartial: t.adminSeatingListStatusFilterPartial,
                            listStatusFilterUnseated: t.adminSeatingListStatusFilterUnseated,
                            listColumnName: t.adminSeatingListColumnName,
                            listColumnSide: t.adminSeatingListColumnSide,
                            listColumnCategory: t.adminSeatingListColumnCategory,
                            listColumnInvited: t.adminSeatingListColumnInvited,
                            listColumnStatus: t.adminSeatingListColumnStatus,
                            listColumnTables: t.adminSeatingListColumnTables,
                            listEmpty: t.adminSeatingListEmpty,
                            deleteCheckboxLabel: t.adminSeatingDeleteCheckboxLabel,
                            deleteSelectedButton: t.adminSeatingDeleteSelectedButton,
                            deleteSelectedTablesConfirm: t.adminSeatingDeleteSelectedTablesConfirm,
                            clearSelectionButton: t.adminSeatingClearSelectionButton,
                            selectAllTablesButton: t.adminSeatingSelectAllTablesButton,
                            objectsHeading: t.adminSeatingObjectsHeading,
                            addObjectButton: t.adminSeatingAddObjectButton,
                            objectLabelPlaceholder: t.adminSeatingObjectLabelPlaceholder,
                            objectTypeStage: t.adminSeatingObjectTypeStage,
                            objectTypeBar: t.adminSeatingObjectTypeBar,
                            objectTypeEntrance: t.adminSeatingObjectTypeEntrance,
                            objectTypeDanceFloor: t.adminSeatingObjectTypeDanceFloor,
                            objectTypeCustom: t.adminSeatingObjectTypeCustom,
                            saveObject: t.adminSeatingSaveObject,
                            deleteObjectConfirm: t.adminSeatingDeleteObjectConfirm,
                            deleteSelectedObjectsConfirm: t.adminSeatingDeleteSelectedObjectsConfirm,
                            duplicateSuffix: t.adminSeatingDuplicateSuffix,
                            alertsHeading: t.adminSeatingAlertsHeading,
                            alertReasonNotConfirmed: t.adminSeatingAlertReasonNotConfirmed,
                            alertReasonReducedCount: t.adminSeatingAlertReasonReducedCount,
                            alertMessage: t.adminSeatingAlertMessage,
                            alertMessageNeedsMoreSeats: t.adminSeatingAlertMessageNeedsMoreSeats,
                            dismissAlert: t.adminSeatingDismissAlert,
                            lockLayoutButton: t.adminSeatingLockLayoutButton,
                            unlockLayoutButton: t.adminSeatingUnlockLayoutButton,
                            guestLookupHeading: t.adminSeatingGuestLookupHeading,
                            guestLookupPlaceholder: t.adminSeatingGuestLookupPlaceholder,
                            guestLookupEmpty: t.adminSeatingGuestLookupEmpty,
                            guestLookupStatusConfirmed: t.adminSeatingGuestLookupStatusConfirmed,
                            guestLookupStatusDeclined: t.adminSeatingGuestLookupStatusDeclined,
                            guestLookupStatusPending: t.adminSeatingGuestLookupStatusPending,
                        }}
                    />
                </motion.section>
                )}

                {displayedTab === 'gifts' && (
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6"
                >
                    <GiftsSection
                        records={giftRecords}
                        isLoading={isLoading || isLoadingGiftEntries}
                        isExporting={isExportingGifts}
                        onUpdateGift={handleUpdateRosterGift}
                        onExport={handleExportGifts}
                        labels={{
                            title: t.adminGiftsTitle,
                            subtitle: t.adminGiftsSubtitle,
                            totalLabel: t.adminGiftsTotalLabel,
                            missingLabel: t.adminGiftsMissingLabel,
                            bySideHeading: t.adminGiftsBySideHeading,
                            byCategoryHeading: t.adminGiftsByCategoryHeading,
                            breakdownEmpty: t.adminGiftsBreakdownEmpty,
                            methodCash: t.adminGiftsMethodCash,
                            methodBitPaybox: t.adminGiftsMethodBitPaybox,
                            methodCheck: t.adminGiftsMethodCheck,
                            currencyLabel: t.adminGiftsCurrencyLabel,
                            filterAll: t.adminGiftsFilterAll,
                            filterMissing: t.adminGiftsFilterMissing,
                            filterHasAmount: t.adminGiftsFilterHasAmount,
                            sideFilterAll: t.adminGiftsSideFilterAll,
                            categoryFilterAll: t.adminGiftsCategoryFilterAll,
                            searchPlaceholder: t.adminGiftsSearchPlaceholder,
                            amountPlaceholder: t.adminGiftsAmountPlaceholder,
                            saveButton: t.adminGiftsSaveButton,
                            savingButton: t.adminGiftsSavingButton,
                            saveError: t.adminGiftsSaveError,
                            clearButton: t.adminGiftsClearButton,
                            clearConfirm: t.adminGiftsClearConfirm,
                            countLabel: t.adminGiftsCountLabel,
                            guestsWord: t.adminGiftsGuestsWord,
                            recordsWord: t.adminGiftsRecordsWord,
                            emptyState: t.adminGiftsEmptyState,
                            loading: t.adminLoading,
                            exportButton: t.adminGiftsExportButton,
                            exportingButton: t.adminGiftsExportingButton,
                            attendanceAttending: t.adminStatusAttending,
                            attendanceNotAttending: t.adminStatusNotAttending,
                            attendancePending: t.adminRosterPending,
                            attendanceFilterAll: t.adminGiftsAttendanceFilterAll,
                            byAttendanceHeading: t.adminGiftsByAttendanceHeading,
                            notAttendingPaidLabel: t.adminGiftsNotAttendingPaidLabel,
                        }}
                    />
                </motion.section>
                )}
            </div>
        </div>
    );
}
