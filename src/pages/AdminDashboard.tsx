import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Download,
    Languages,
    LogOut,
    RefreshCcw,
    Trash2,
    UserCheck,
    Users,
    UserX,
} from 'lucide-react';
import { motion } from 'motion/react';
import logoSg from '../assets/logo-sg-dark.png';
import { db } from '../firebase';
import { Language, translations } from '../i18n';
import { logoutAdmin, onAdminAuthStateChanged } from '../admin/auth';
import { exportRsvpWorkbook } from '../admin/exportRsvpWorkbook';
import { GuestCountInput } from '../components/admin/GuestCountInput';
import { EditableTextField } from '../components/admin/EditableTextField';
import { GuestGroupSelect } from '../components/admin/GuestGroupSelect';
import { InviteLinkVisitsTable, type InviteLinkVisitRecord } from '../components/admin/InviteLinkVisitsTable';
import { GuestRosterSection } from '../components/admin/GuestRosterSection';
import { OldSiteRsvpImportPanel } from '../components/admin/OldSiteRsvpImportPanel';
import { DuplicateFinderPanel } from '../components/admin/DuplicateFinderPanel';
import { enrichInviteLinkVisitsWithBaseList } from '../services/inviteLinkVisits';
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
import { findRosterMatches, linkGuestRosterWithRsvps, type RosterLinkResult } from '../services/rsvpRosterLink';

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
                className="inline-flex items-center gap-1.5 rounded-md hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
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
}

// Highlights "no match"/"ambiguous" cases with an amber warning badge so
// they catch the eye instead of blending in as plain text - these are the
// ones that need a manual look (fix a typo in the name, or add the guest to
// the roster) since name-matching couldn't place them on its own.
function RosterMatchBadge({ info }: { info: RosterMatchInfo }) {
    if (info.status === 'none' || info.status === 'ambiguous') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                <AlertTriangle size={12} aria-hidden="true" />
                {info.label}
            </span>
        );
    }
    return <span className="text-gray-700">{info.label}</span>;
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
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deletingInviteLinkVisitId, setDeletingInviteLinkVisitId] = useState<string | null>(null);
    const [isEnrichingInviteLinks, setIsEnrichingInviteLinks] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDeletingSelected, setIsDeletingSelected] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    // Kept only for the Excel export summary sheet, which still includes it -
    // no longer editable or shown anywhere in the dashboard UI itself.
    const [plannedGuests, setPlannedGuests] = useState(0);
    const [activeResponseHour, setActiveResponseHour] = useState<number | null>(null);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'createdAt', direction: 'desc' });
    const [isAuthChecked, setIsAuthChecked] = useState(false);
    const [isSignedIn, setIsSignedIn] = useState(false);
    const [activeTab, setActiveTab] = useState<'roster' | 'responses'>('roster');

    const isValidLang = lang === 'en' || lang === 'he' || lang === 'fr';
    const currentLang = (isValidLang ? lang : 'he') as Language;
    const isRtl = currentLang === 'he';
    const t = translations[currentLang];
    const loginPath = `/${currentLang}/admin`;

    useEffect(() => {
        document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
        document.documentElement.lang = currentLang;
    }, [currentLang, isRtl]);

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

        return () => {
            unsubscribeRsvps();
            unsubscribeRoster();
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

    // Which side/category each site response belongs to, matched by name
    // against the guest roster - display only (mirrors the matching used by
    // the "Link" button in the Roster tab), so this never writes anything,
    // it just answers "who is this on the roster" right in the responses
    // table instead of needing to cross-reference manually.
    const rosterMatchInfoByRecordId = useMemo(() => {
        const map = new Map<string, RosterMatchInfo>();
        records.forEach((record) => {
            if (!record.fullName.trim()) {
                map.set(record.id, { status: 'empty', label: '-' });
                return;
            }

            const matches = findRosterMatches(record.fullName, guestRoster);
            if (matches.length === 0) {
                map.set(record.id, { status: 'none', label: t.adminNoRosterMatch });
            } else if (matches.length > 1) {
                map.set(record.id, { status: 'ambiguous', label: t.adminAmbiguousRosterMatch });
            } else {
                map.set(record.id, { status: 'matched', label: `${matches[0].side} · ${matches[0].category}` });
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

    const pendingInviteLinkVisits = useMemo(
        () => inviteLinkVisits.filter((visit) => !rsvpStatusByPhone.has(visit.phone)),
        [inviteLinkVisits, rsvpStatusByPhone],
    );

    const isAllSelected = records.length > 0 && selectedIds.length === records.length;

    const handleLogout = async () => {
        await logoutAdmin();
        navigate(loginPath, { replace: true });
    };

    const handleRefresh = async () => {
        setIsLoading(true);
        setError('');
        try {
            const [loadedRecords, loadedInviteLinkVisits, loadedGuestRoster] = await Promise.all([
                loadRsvpRecords(),
                loadInviteLinkVisits(),
                loadGuestRoster(),
            ]);
            setRecords(loadedRecords);
            setInviteLinkVisits(loadedInviteLinkVisits);
            setGuestRoster(loadedGuestRoster);
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
            })),
        )
            .catch((linkError) => {
                console.error('Automatic roster linking failed', linkError);
            })
            .finally(() => {
                isAutoLinkingRosterRef.current = false;
            });
    }, [records, guestRoster, isAuthChecked, isSignedIn]);

    const handleCreateGuestRosterEntry = async (input: GuestRosterEntryInput) => {
        await createGuestRosterEntry(input);
        await reloadGuestRoster();
    };

    const handleUpdateGuestRosterEntry = async (id: string, input: GuestRosterEntryInput) => {
        await updateGuestRosterEntry(id, input);
        await reloadGuestRoster();
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
        if (isAllSelected) {
            setSelectedIds([]);
            return;
        }
        setSelectedIds(records.map((record) => record.id));
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

    const handleEnrichInviteLinkVisits = async () => {
        if (isEnrichingInviteLinks || pendingInviteLinkVisits.length === 0) {
            return;
        }

        setIsEnrichingInviteLinks(true);
        setError('');

        try {
            const result = await enrichInviteLinkVisitsWithBaseList(pendingInviteLinkVisits);

            if (result.updatedCount > 0) {
                setInviteLinkVisits(await loadInviteLinkVisits());
            }

            if (result.failedCount > 0) {
                setError(t.adminInviteLinkEnrichError);
            }
        } catch (enrichError) {
            console.error('Failed to enrich invite link visits', enrichError);
            setError(t.adminInviteLinkEnrichError);
        } finally {
            setIsEnrichingInviteLinks(false);
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
    return (
        <div className="min-h-screen relative overflow-hidden wedding-silk-background selection:bg-rose-200 selection:text-rose-900">
            <div className="absolute inset-0 z-0 wedding-foliage-shadow" aria-hidden="true" />
            <div className="absolute inset-0 z-0 wedding-paper-grain" aria-hidden="true" />

            <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
                <motion.header
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative mb-6 rounded-3xl border border-white/30 bg-white/90 p-6 shadow-xl backdrop-blur-md"
                >
                    <div className="absolute end-4 top-4 flex items-center gap-1.5 sm:gap-2">
                        <button
                            type="button"
                            onClick={handleRefresh}
                            title={t.adminRefresh}
                            aria-label={t.adminRefresh}
                            className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200 sm:h-9 sm:w-9"
                        >
                            <RefreshCcw size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={handleExport}
                            disabled={(records.length === 0 && guestRoster.length === 0) || isLoading || isExporting}
                            title={t.adminExportExcel}
                            aria-label={t.adminExportExcel}
                            className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors sm:h-9 sm:w-9 ${(records.length === 0 && guestRoster.length === 0) || isLoading || isExporting
                                ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                }`}
                        >
                            {isExporting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-700" /> : <Download size={16} />}
                        </button>
                        <button
                            type="button"
                            onClick={handleLogout}
                            title={t.adminLogout}
                            aria-label={t.adminLogout}
                            className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-900 text-white transition-colors hover:bg-gray-800 sm:h-9 sm:w-9"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>

                    <div className="flex items-center gap-3 pe-28 sm:pe-32">
                        <div
                            className="h-14 w-12 shrink-0 overflow-hidden rounded-xl border border-rose-100"
                            aria-hidden="true"
                        >
                            <img src={logoSg} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">{t.adminDashboardTitle}</p>
                            <h1 className="text-3xl font-serif text-gray-900">חתונת שלי וגיל</h1>
                            <p className="mt-1 text-gray-600">{t.adminDashboardSubtitle}</p>
                        </div>
                    </div>

                    <div className="mt-5 flex gap-2 border-b border-gray-100">
                        <button
                            type="button"
                            onClick={() => setActiveTab('roster')}
                            className={`border-b-2 px-1 py-2.5 text-sm font-medium transition-colors ${activeTab === 'roster'
                                ? 'border-gray-900 text-gray-900'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {t.adminRosterTitle}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('responses')}
                            className={`border-b-2 px-1 py-2.5 text-sm font-medium transition-colors ${activeTab === 'responses'
                                ? 'border-gray-900 text-gray-900'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {t.adminTabResponses}
                        </button>
                    </div>
                </motion.header>

                {activeTab === 'roster' && (
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
                        }}
                    />
                </motion.section>
                )}

                {activeTab === 'roster' && (
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="mb-6"
                >
                    <OldSiteRsvpImportPanel entries={guestRoster} onApplied={reloadGuestRoster} />
                </motion.section>
                )}

                {activeTab === 'roster' && (
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    className="mb-6"
                >
                    <DuplicateFinderPanel entries={guestRoster} onDelete={handleDeleteGuestRosterEntry} />
                </motion.section>
                )}

                {activeTab === 'responses' && (
                <>
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
                >
                    <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md">
                        <div className="mb-3 flex items-center gap-2 text-gray-500">
                            <Users size={16} />
                            <span className="text-sm font-medium">{t.adminTotalSubmissions}</span>
                        </div>
                        <p dir="ltr" className="text-3xl font-semibold text-gray-900">{records.length}</p>
                    </article>

                    <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md">
                        <div className="mb-3 flex items-center gap-2 text-emerald-600">
                            <UserCheck size={16} />
                            <span className="text-sm font-medium">{t.adminAttendingCount}</span>
                        </div>
                        <p dir="ltr" className="text-3xl font-semibold text-gray-900">{attendingCount}</p>
                    </article>

                    <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md">
                        <div className="mb-3 flex items-center gap-2 text-rose-600">
                            <UserX size={16} />
                            <span className="text-sm font-medium">{t.adminNotAttendingCount}</span>
                        </div>
                        <p dir="ltr" className="text-3xl font-semibold text-gray-900">{notAttendingCount}</p>
                    </article>

                    <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md">
                        <div className="mb-3 flex items-center gap-2 text-gray-500">
                            <Languages size={16} />
                            <span className="text-sm font-medium">{t.adminLanguageBreakdown}</span>
                        </div>
                        <div className="space-y-1 text-sm text-gray-700">
                            <p dir="ltr">HE: {languageBreakdown.he}</p>
                            <p dir="ltr">EN: {languageBreakdown.en}</p>
                            <p dir="ltr">FR: {languageBreakdown.fr}</p>
                        </div>
                    </article>
                </motion.section>

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
                        isEnriching={isEnrichingInviteLinks}
                        deletingVisitId={deletingInviteLinkVisitId}
                        onDelete={handleDeleteInviteLinkVisit}
                        onEnrich={handleEnrichInviteLinkVisits}
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
                            enrichAction: t.adminInviteLinkEnrich,
                            enrichingAction: t.adminInviteLinkEnriching,
                        }}
                    />
                </motion.section>

                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    className="order-3 mb-6 grid gap-4 xl:grid-cols-2"
                >
                    <article className="rounded-3xl border border-white/30 bg-white/95 p-5 shadow-lg backdrop-blur-md">
                        <h3 className="mb-4 text-sm font-semibold text-gray-700">{t.adminChartFunnelTitle}</h3>
                        <div className="space-y-3">
                            {funnelSteps.map((step) => (
                                <div key={step.label}>
                                    <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                                        <span>{step.label}</span>
                                        <span dir="ltr" className="font-semibold text-gray-900">{step.value}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-gray-100">
                                        <div className="h-2 rounded-full bg-gray-900/70" style={{ width: `${step.percent}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-3xl border border-white/30 bg-white/95 p-5 shadow-lg backdrop-blur-md">
                        <h3 className="mb-3 text-sm font-semibold text-gray-700">{t.adminChartLanguageAttendanceTitle}</h3>
                        <div className="mb-4 flex items-center gap-4 text-xs text-gray-600">
                            <span className="inline-flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                {t.adminChartLegendAttending}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-rose-300" />
                                {t.adminChartLegendNotAttending}
                            </span>
                        </div>

                        <div className="space-y-3" dir="ltr">
                            {languageAttendanceData.map((item) => (
                                <div key={item.label}>
                                    <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                                        <span>{item.label}</span>
                                        <span className="font-semibold text-gray-900">{item.total}</span>
                                    </div>
                                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
                                        <div
                                            className="h-full bg-emerald-400"
                                            style={{ width: `${(item.attending / maxLanguageAttendance) * 100}%` }}
                                        />
                                        <div
                                            className="h-full bg-rose-300"
                                            style={{ width: `${(item.notAttending / maxLanguageAttendance) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-3xl border border-white/30 bg-white/95 p-5 shadow-lg backdrop-blur-md">
                        <h3 className="mb-3 text-sm font-semibold text-gray-700">{t.adminChartResponsesTimelineTitle}</h3>
                        {peakResponseHour.count === 0 ? (
                            <p className="text-sm text-gray-500">{t.adminChartNoData}</p>
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
                                        stroke="#e5e7eb"
                                        strokeWidth="1"
                                    />
                                    <polyline fill="none" stroke="#0f172a" strokeWidth="3" points={hourlyPolylinePoints} />
                                    {hourlyChartPoints.map((point, hour) => (
                                        <g key={hour}>
                                            <circle
                                                cx={point.x}
                                                cy={point.y}
                                                r={hour === peakResponseHour.hour ? 4.5 : 2}
                                                fill={hour === peakResponseHour.hour ? '#e11d48' : '#0f172a'}
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
                                                    fill="#111827"
                                                />
                                                <text
                                                    x={tooltipX + 40}
                                                    y={tooltipY + 15}
                                                    fill="white"
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
                                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                                    {[0, 6, 12, 18, 23].map((hour) => (
                                        <span key={hour}>{String(hour).padStart(2, '0')}:00</span>
                                    ))}
                                </div>
                                <p className="mt-3 text-center text-xs font-medium text-rose-600">
                                    {t.adminChartPeakHour}: {String(peakResponseHour.hour).padStart(2, '0')}:00 ({peakResponseHour.count})
                                </p>
                            </div>
                        )}
                    </article>

                    <article className="rounded-3xl border border-white/30 bg-white/95 p-5 shadow-lg backdrop-blur-md">
                        <h3 className="mb-3 text-sm font-semibold text-gray-700">{t.adminChartSeatsTimelineTitle}</h3>
                        {groupDistributionData.length === 0 ? (
                            <p className="text-sm text-gray-500">{t.adminChartNoData}</p>
                        ) : (
                            <div className="max-h-48 space-y-3 overflow-y-auto pe-1">
                                {groupDistributionData.map((group) => (
                                    <div key={group.label}>
                                        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                                            <span className="truncate text-gray-600" title={group.label}>{group.label}</span>
                                            <span className="shrink-0 font-semibold text-gray-900" dir="ltr">{group.count}</span>
                                        </div>
                                        <div className="h-3 overflow-hidden rounded-full bg-gray-100">
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

                    <article className="rounded-3xl border border-white/30 bg-white/95 p-5 shadow-lg backdrop-blur-md">
                        <h3 className="mb-3 text-sm font-semibold text-gray-700">{t.adminChartGuestsDistributionTitle}</h3>
                        {guestsDistributionData.every((bucket) => bucket.count === 0) ? (
                            <p className="text-sm text-gray-500">{t.adminChartNoData}</p>
                        ) : (
                            <div className="mt-3 flex items-end gap-3" dir="ltr">
                                {guestsDistributionData.map((bucket) => (
                                    <div key={bucket.label} className="flex flex-1 flex-col items-center gap-1">
                                        <div
                                            className="w-full max-w-16 rounded-t-xl bg-gray-900/70"
                                            style={{
                                                height: `${Math.max((bucket.count / maxGuestsDistribution) * 120, bucket.count > 0 ? 10 : 2)}px`,
                                            }}
                                        />
                                        <span className="text-xs text-gray-600">{bucket.label}</span>
                                        <span dir="ltr" className="text-xs font-semibold text-gray-900">{bucket.count}</span>
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
                    className="order-2 mb-6 overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md"
                >
                    {selectedIds.length > 0 && (
                        <div className="flex items-center justify-between gap-3 border-b border-rose-100 bg-rose-50 px-5 py-2.5">
                            <span className="text-sm font-medium text-rose-700">{selectedIds.length} {t.adminSelectedCount}</span>
                            <button
                                type="button"
                                onClick={handleDeleteSelected}
                                disabled={isDeletingSelected}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-200 disabled:opacity-60"
                            >
                                <Trash2 size={14} />
                                {isDeletingSelected ? t.adminDeletingSelectedAction : t.adminDeleteSelectedAction}
                            </button>
                        </div>
                    )}
                    {isLoading ? (
                        <div className="flex items-center justify-center gap-3 p-10 text-gray-600">
                            <span className="h-5 w-5 rounded-full border-2 border-gray-200 border-t-gray-700 animate-spin" />
                            <span>{t.adminLoading}</span>
                        </div>
                    ) : error ? (
                        <div className="p-6 text-center text-rose-600">{error}</div>
                    ) : records.length === 0 ? (
                        <div className="p-8 text-center text-gray-600">{t.adminNoRecords}</div>
                    ) : (
                        <>
                        {/* Mobile card list (below md breakpoint) */}
                        <div className="divide-y divide-gray-100 md:hidden">
                            {sortedRecords.map((record, index) => (
                                <div key={record.id} className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(record.id)}
                                                onChange={() => handleToggleRecordSelection(record.id)}
                                                disabled={isDeletingSelected || deletingId === record.id}
                                                aria-label={t.adminSelectRow}
                                                className="mt-1 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300"
                                            />
                                            <div>
                                                <p className="font-medium text-gray-900">
                                                    <span className="text-gray-400 me-1" dir="ltr">#{index + 1}</span>
                                                    {record.fullName || t.adminUnknownName}
                                                </p>
                                                <p className="text-xs text-gray-500" dir="ltr">{record.phone || t.adminNoPhone}</p>
                                                <div className="mt-1">
                                                    <RosterMatchBadge info={rosterMatchInfoByRecordId.get(record.id) ?? { status: 'empty', label: '-' }} />
                                                </div>
                                            </div>
                                        </div>
                                        <span
                                            className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-medium ${record.isAttending
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-rose-100 text-rose-700'
                                                }`}
                                        >
                                            {record.isAttending ? t.adminStatusAttending : t.adminStatusNotAttending}
                                        </span>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-3">
                                        <div className="col-span-2">
                                            <p className="mb-1 text-xs font-medium text-gray-500">{t.adminTableName}</p>
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
                                            <p className="mb-1 text-xs font-medium text-gray-500">{t.adminTableGuests}</p>
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
                                            <p className="mb-1 text-xs font-medium text-gray-500">{t.adminTableGroup}</p>
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
                                    </div>

                                    {record.note && (
                                        <p className="mt-3 rounded-xl bg-gray-50 p-2.5 text-sm text-gray-700">{record.note}</p>
                                    )}

                                    <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                                        <span dir="ltr">{record.lang.toUpperCase()}</span>
                                        <span dir="ltr">{formatDate(record.createdAt)}</span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => handleDelete(record.id)}
                                        disabled={deletingId === record.id || isDeletingSelected}
                                        className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${deletingId === record.id || isDeletingSelected
                                            ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                                            : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                                            }`}
                                    >
                                        <Trash2 size={14} />
                                        {deletingId === record.id ? t.adminDeletingAction : t.adminDeleteAction}
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Desktop table (md breakpoint and up) */}
                        <div className="hidden overflow-x-auto md:block">
                            <table className="min-w-full table-fixed divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50/80 text-gray-600">
                                    <tr>
                                        <th className="w-24 px-4 py-3 text-start font-semibold">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={isAllSelected}
                                                    onChange={handleToggleAllSelection}
                                                    disabled={isDeletingSelected || deletingId !== null}
                                                    aria-label={t.adminSelectAllRows}
                                                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300"
                                                />
                                                <span>{t.adminTableSelect}</span>
                                            </div>
                                        </th>
                                        <th className="w-20 px-4 py-3 text-center font-semibold">{t.adminTableIndex}</th>
                                        <SortableHeader
                                            className="w-48 text-start"
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
                                            className="text-start"
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
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {sortedRecords.map((record, index) => (
                                        <tr key={record.id} className="align-top">
                                            <td className="w-24 px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(record.id)}
                                                    onChange={() => handleToggleRecordSelection(record.id)}
                                                    disabled={isDeletingSelected || deletingId === record.id}
                                                    aria-label={t.adminSelectRow}
                                                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300"
                                                />
                                            </td>
                                            <td className="w-20 px-4 py-3 text-center text-gray-700" dir="ltr">{index + 1}</td>
                                            <td className="w-48 px-4 py-3 font-medium text-gray-900">
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
                                            <td className="w-40 px-4 py-3 text-center text-gray-700 whitespace-nowrap" dir="ltr">{record.phone || t.adminNoPhone}</td>
                                            <td className="w-40 px-4 py-3 text-center text-gray-700">
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
                                            <td className="w-40 px-4 py-3 text-gray-700">
                                                <RosterMatchBadge info={rosterMatchInfoByRecordId.get(record.id) ?? { status: 'empty', label: '-' }} />
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${record.isAttending
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-rose-100 text-rose-700'
                                                        }`}
                                                >
                                                    {record.isAttending ? t.adminStatusAttending : t.adminStatusNotAttending}
                                                </span>
                                            </td>
                                            <td className="w-24 px-4 py-3 text-center text-gray-700" dir="ltr">{record.lang}</td>
                                            <td className="w-44 px-4 py-3 text-center text-gray-700 whitespace-nowrap" dir="ltr">{formatDate(record.createdAt)}</td>
                                            <td className="w-32 px-4 py-3">
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(record.id)}
                                                    disabled={deletingId === record.id || isDeletingSelected}
                                                    className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${deletingId === record.id || isDeletingSelected
                                                        ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                                                        : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
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
            </div>
        </div>
    );
}
