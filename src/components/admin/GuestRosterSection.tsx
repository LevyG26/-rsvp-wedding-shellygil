import { useMemo, useState } from 'react';
import { Check, ChevronDown, Clock, Copy, Link2, Loader2, MessageCircle, Plus, RefreshCw, Trash2, UserCheck, Users, UserX, X } from 'lucide-react';
import type { GuestRosterEntry, GuestRosterEntryInput, KnownResponse } from '../../services/guestRoster';
import type { RosterLinkResult } from '../../services/rsvpRosterLink';
import { EVENT_START_ISO } from '../../eventDetails';

export interface GuestRosterLabels {
  title: string;
  subtitle: string;
  loading: string;
  noRecords: string;
  totalInvited: string;
  confirmed: string;
  declined: string;
  pending: string;
  sideBreakdown: string;
  categoryBreakdown: string;
  overallHeading: string;
  filterHeading: string;
  side: string;
  category: string;
  name: string;
  status: string;
  invitedCount: string;
  searchPlaceholder: string;
  allSides: string;
  allCategories: string;
  allStatuses: string;
  statusConfirmed: string;
  statusDeclined: string;
  statusPending: string;
  actions: string;
  deleteAction: string;
  syncButton: string;
  syncing: string;
  syncAdded: string;
  syncUpdated: string;
  syncNone: string;
  syncError: string;
  linkButton: string;
  linking: string;
  linkUpdated: string;
  linkNone: string;
  linkAmbiguous: string;
  linkReverted: string;
  linkError: string;
  resetSideButton: string;
  resettingSide: string;
  resetSideConfirm: string;
  resetSideResult: string;
  resetSideError: string;
  fullList: string;
  records: string;
  addGuest: string;
  firstName: string;
  lastName: string;
  addSubmit: string;
  cancel: string;
  saving: string;
  deleteConfirm: string;
  deleteError: string;
  updateError: string;
  createError: string;
  requiredName: string;
}

interface GuestRosterSectionProps {
  entries: GuestRosterEntry[];
  isLoading: boolean;
  labels: GuestRosterLabels;
  locale: string;
  onSync: () => Promise<{ addedCount: number; updatedCount: number }>;
  onResetSide: (side: string) => Promise<{ deletedCount: number; addedCount: number }>;
  onLinkRsvps: () => Promise<RosterLinkResult>;
  onCreate: (input: GuestRosterEntryInput) => Promise<void>;
  onUpdate: (id: string, input: GuestRosterEntryInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

interface Totals {
  invited: number;
  confirmed: number;
  declined: number;
  pending: number;
}

function emptyTotals(): Totals {
  return { invited: 0, confirmed: 0, declined: 0, pending: 0 };
}

function addEntry(totals: Totals, entry: GuestRosterEntry): void {
  totals.invited += entry.invitedCount;
  if (entry.knownResponse === 'yes') {
    totals.confirmed += entry.invitedCount;
  } else if (entry.knownResponse === 'no') {
    totals.declined += entry.invitedCount;
  } else {
    totals.pending += entry.invitedCount;
  }
}

const bigStatTones = {
  blue: 'border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300',
  emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300',
  rose: 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300',
  gray: 'border-gray-100 bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function BigStatCard({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number; tone: keyof typeof bigStatTones }) {
  return (
    <div className={`rounded-2xl border p-4 sm:p-5 ${bigStatTones[tone]}`}>
      <Icon size={20} className="opacity-80" aria-hidden="true" />
      <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function StatCard({ label, value, accentClassName }: { label: string; value: number; accentClassName: string }) {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/80 p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accentClassName}`}>{value}</p>
    </div>
  );
}

const emptyForm = { side: '', category: '', firstName: '', lastName: '', invitedCount: '1', knownResponse: '' as '' | KnownResponse };

// One line with the wedding's own details (names, date/time, venue) so any
// list shared out of the dashboard - to a parent, an usher, anyone helping
// with follow-up calls - is self-explanatory on its own, without needing
// context from whoever forwards it.
const WEDDING_DETAILS_LINE = (() => {
  const date = new Date(EVENT_START_ISO);
  const datePart = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  const timePart = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return `חתונת שלי וגיל · ${datePart} · שעה ${timePart} · חוות רונית`;
})();

function statusFilterLabel(statusFilter: string, labels: GuestRosterLabels): string {
  if (statusFilter === 'yes') return labels.statusConfirmed;
  if (statusFilter === 'no') return labels.statusDeclined;
  if (statusFilter === 'pending') return labels.statusPending;
  return '';
}

// Temporarily re-enabled: needed again to fix a real count mismatch on
// גיל's side (stale duplicate entries from old category renames in the
// sheet). Hide again once that's resolved by flipping this back to false.
const SHOW_RESET_SIDE_BUTTON = true;

export function GuestRosterSection({ entries, isLoading, labels, locale, onSync, onResetSide, onLinkRsvps, onCreate, onUpdate, onDelete }: GuestRosterSectionProps) {
  const [search, setSearch] = useState('');
  const [sideFilter, setSideFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncIsError, setSyncIsError] = useState(false);

  const [isLinking, setIsLinking] = useState(false);
  const [linkMessage, setLinkMessage] = useState('');
  const [linkIsError, setLinkIsError] = useState(false);

  const [isResettingSide, setIsResettingSide] = useState(false);
  const [resetSideMessage, setResetSideMessage] = useState('');
  const [resetSideIsError, setResetSideIsError] = useState(false);

  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const [isListOpen, setIsListOpen] = useState(false);

  // Mobile cards default to a single compact summary line per guest (name,
  // side/category, count, status) and only reveal the editable fields +
  // delete button once tapped open - fitting every field on one line for
  // every guest isn't realistic on a phone screen, so this trades that for
  // "one line to scan, one tap to edit" instead.
  const [expandedEntryIds, setExpandedEntryIds] = useState<Set<string>>(new Set());
  const toggleEntryExpanded = (id: string) => {
    setExpandedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const [isCopied, setIsCopied] = useState(false);

  const overallTotals = useMemo(() => {
    const totals = emptyTotals();
    entries.forEach((entry) => addEntry(totals, entry));
    return totals;
  }, [entries]);

  const sides = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.side).filter(Boolean))).sort((a, b) => a.localeCompare(b, locale)),
    [entries, locale],
  );

  // Scoped to the selected side (if any), so the dropdown never offers
  // categories that don't exist on that side - e.g. picking "גיל" shouldn't
  // still show "שלי"'s categories.
  const categories = useMemo(
    () => Array.from(
      new Set(
        entries
          .filter((entry) => !sideFilter || entry.side === sideFilter)
          .map((entry) => entry.category)
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, locale)),
    [entries, locale, sideFilter],
  );

  const sideTotals = useMemo(() => {
    const bySide = new Map<string, Totals>();
    entries.forEach((entry) => {
      const totals = bySide.get(entry.side) ?? emptyTotals();
      addEntry(totals, entry);
      bySide.set(entry.side, totals);
    });
    return bySide;
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return entries
      .filter((entry) => !sideFilter || entry.side === sideFilter)
      .filter((entry) => !categoryFilter || entry.category === categoryFilter)
      .filter((entry) => {
        if (!statusFilter) return true;
        if (statusFilter === 'yes') return entry.knownResponse === 'yes';
        if (statusFilter === 'no') return entry.knownResponse === 'no';
        return entry.knownResponse === null;
      })
      .filter((entry) => {
        if (!query) return true;
        const fullName = `${entry.firstName} ${entry.lastName}`.toLowerCase();
        return fullName.includes(query) || entry.category.toLowerCase().includes(query);
      })
      .sort((a, b) => `${a.firstName}${a.lastName}`.localeCompare(`${b.firstName}${b.lastName}`, locale));
  }, [entries, search, sideFilter, categoryFilter, statusFilter, locale]);

  // Sum of invitedCount across the filtered rows - shown alongside the row
  // count in the list header, since "156 rows" and "222 people invited" are
  // two different numbers (a row can represent a couple/family of more than
  // one) and showing only the row count was confusing.
  const filteredInvitedTotal = useMemo(
    () => filteredEntries.reduce((sum, entry) => sum + entry.invitedCount, 0),
    [filteredEntries],
  );

  const hasActiveFilter = search.trim() !== '' || sideFilter !== '' || categoryFilter !== '' || statusFilter !== '';
  const isListVisible = isListOpen || hasActiveFilter;

  // Builds a ready-to-send WhatsApp message from whatever is currently
  // filtered (side/category/status/search) - e.g. "צד גיל · חברים דור · טרם
  // ענו" - so sharing "the list I'm looking at right now" is one tap away,
  // whether that's to a helper following up on calls or just for Gil's own
  // records.
  const whatsAppMessage = useMemo(() => {
    // WhatsApp renders *text* as bold and _text_ as italic in the message
    // itself, so wrapping the group/status in asterisks makes them stand
    // out for whoever receives it - not just a plain flat line.
    const filterLines: string[] = [];
    if (sideFilter) filterLines.push(`צד: ${sideFilter}`);
    if (categoryFilter) filterLines.push(`קבוצה: *${categoryFilter}*`);
    const statusLabel = statusFilterLabel(statusFilter, labels);
    if (statusLabel) filterLines.push(`סטטוס: *${statusLabel}*`);

    const titleBlock = filterLines.length > 0
      ? ['📋 *רשימת מוזמנים*', ...filterLines]
      : ['📋 *רשימת מוזמנים* - כולם'];

    const nameLines = filteredEntries.map((entry, index) => {
      const fullName = `${entry.firstName} ${entry.lastName}`.trim() || '(ללא שם)';
      const countSuffix = entry.invitedCount > 1 ? ` (${entry.invitedCount})` : '';
      return `${index + 1}. ${fullName}${countSuffix}`;
    });

    const summaryLine = `סה"כ: ${filteredEntries.length} רשומות · ${filteredInvitedTotal} מוזמנים`;

    return [...titleBlock, '', WEDDING_DETAILS_LINE, '', ...nameLines, '', summaryLine].join('\n');
  }, [filteredEntries, filteredInvitedTotal, sideFilter, categoryFilter, statusFilter, labels]);

  const handleShareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(whatsAppMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyList = async () => {
    try {
      await navigator.clipboard.writeText(whatsAppMessage);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch (copyError) {
      console.error('Failed to copy guest list to clipboard', copyError);
    }
  };

  const statusBadge = (response: GuestRosterEntry['knownResponse']) => {
    if (response === 'yes') {
      return <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{labels.statusConfirmed}</span>;
    }
    if (response === 'no') {
      return <span className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{labels.statusDeclined}</span>;
    }
    return <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-slate-800 dark:text-slate-300">{labels.statusPending}</span>;
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage('');
    setSyncIsError(false);
    try {
      const result = await onSync();
      if (result.addedCount > 0 || result.updatedCount > 0) {
        const parts: string[] = [];
        if (result.addedCount > 0) parts.push(`${labels.syncAdded}: ${result.addedCount}`);
        if (result.updatedCount > 0) parts.push(`${labels.syncUpdated}: ${result.updatedCount}`);
        setSyncMessage(parts.join(' · '));
      } else {
        setSyncMessage(labels.syncNone);
      }
    } catch (syncError) {
      console.error('Failed to sync guest roster from sheet', syncError);
      setSyncIsError(true);
      setSyncMessage(labels.syncError);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLink = async () => {
    setIsLinking(true);
    setLinkMessage('');
    setLinkIsError(false);
    try {
      const result = await onLinkRsvps();
      const suffixParts: string[] = [];
      if (result.ambiguousCount > 0) suffixParts.push(`${labels.linkAmbiguous}: ${result.ambiguousCount}`);
      if (result.revertedCount > 0) suffixParts.push(`${labels.linkReverted}: ${result.revertedCount}`);
      const suffix = suffixParts.length > 0 ? ` (${suffixParts.join(' · ')})` : '';

      if (result.updatedCount > 0) {
        setLinkMessage(`${labels.linkUpdated}: ${result.updatedCount}${suffix}`);
      } else if (suffixParts.length > 0) {
        setLinkMessage(`${labels.linkNone}${suffix}`);
      } else {
        setLinkMessage(labels.linkNone);
      }
    } catch (linkError) {
      console.error('Failed to link guest roster with RSVPs', linkError);
      setLinkIsError(true);
      setLinkMessage(labels.linkError);
    } finally {
      setIsLinking(false);
    }
  };

  const handleResetSide = async () => {
    if (!sideFilter) return;
    if (typeof window !== 'undefined' && !window.confirm(`${labels.resetSideConfirm} (${sideFilter})`)) {
      return;
    }

    setIsResettingSide(true);
    setResetSideMessage('');
    setResetSideIsError(false);
    try {
      const result = await onResetSide(sideFilter);
      setResetSideMessage(`${labels.resetSideResult}: ${result.deletedCount} → ${result.addedCount}`);
    } catch (resetError) {
      console.error('Failed to reset guest roster side', resetError);
      setResetSideIsError(true);
      setResetSideMessage(labels.resetSideError);
    } finally {
      setIsResettingSide(false);
    }
  };

  const handleAddSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAddError('');

    if (!addForm.firstName.trim() && !addForm.lastName.trim()) {
      setAddError(labels.requiredName);
      return;
    }

    const parsedCount = Number.parseInt(addForm.invitedCount, 10);
    const invitedCount = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1;

    setIsAdding(true);
    try {
      await onCreate({
        side: addForm.side.trim(),
        category: addForm.category.trim(),
        firstName: addForm.firstName.trim(),
        lastName: addForm.lastName.trim(),
        invitedCount,
        knownResponse: addForm.knownResponse === '' ? null : addForm.knownResponse,
      });
      setAddForm(emptyForm);
      setIsAddFormOpen(false);
    } catch (createError) {
      console.error('Failed to create guest roster entry', createError);
      setAddError(labels.createError);
    } finally {
      setIsAdding(false);
    }
  };

  const handleStatusChange = async (entry: GuestRosterEntry, value: string) => {
    const knownResponse: KnownResponse = value === 'yes' || value === 'no' ? value : null;
    setSavingId(entry.id);
    setRowErrors((prev) => ({ ...prev, [entry.id]: '' }));
    try {
      await onUpdate(entry.id, {
        side: entry.side,
        category: entry.category,
        firstName: entry.firstName,
        lastName: entry.lastName,
        invitedCount: entry.invitedCount,
        knownResponse,
      });
    } catch (updateError) {
      console.error('Failed to update guest roster status', updateError);
      setRowErrors((prev) => ({ ...prev, [entry.id]: labels.updateError }));
    } finally {
      setSavingId(null);
    }
  };

  const handleCountChange = async (entry: GuestRosterEntry, value: string) => {
    const parsedCount = Number.parseInt(value, 10);
    const invitedCount = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : entry.invitedCount;
    if (invitedCount === entry.invitedCount) {
      return;
    }

    setSavingId(entry.id);
    setRowErrors((prev) => ({ ...prev, [entry.id]: '' }));
    try {
      await onUpdate(entry.id, {
        side: entry.side,
        category: entry.category,
        firstName: entry.firstName,
        lastName: entry.lastName,
        invitedCount,
        knownResponse: entry.knownResponse,
      });
    } catch (updateError) {
      console.error('Failed to update guest roster count', updateError);
      setRowErrors((prev) => ({ ...prev, [entry.id]: labels.updateError }));
    } finally {
      setSavingId(null);
    }
  };

  // Editing here (unlike renaming in the Google Sheet) keeps the same
  // document ID, so it never creates a duplicate - safe to fix typos
  // directly in the dashboard.
  const handleNameChange = async (entry: GuestRosterEntry, firstName: string, lastName: string) => {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (trimmedFirst === entry.firstName && trimmedLast === entry.lastName) {
      return;
    }
    if (!trimmedFirst && !trimmedLast) {
      return;
    }

    setSavingId(entry.id);
    setRowErrors((prev) => ({ ...prev, [entry.id]: '' }));
    try {
      await onUpdate(entry.id, {
        side: entry.side,
        category: entry.category,
        firstName: trimmedFirst,
        lastName: trimmedLast,
        invitedCount: entry.invitedCount,
        knownResponse: entry.knownResponse,
      });
    } catch (updateError) {
      console.error('Failed to update guest roster name', updateError);
      setRowErrors((prev) => ({ ...prev, [entry.id]: labels.updateError }));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (entry: GuestRosterEntry) => {
    if (typeof window !== 'undefined' && !window.confirm(labels.deleteConfirm)) {
      return;
    }

    setSavingId(entry.id);
    setRowErrors((prev) => ({ ...prev, [entry.id]: '' }));
    try {
      await onDelete(entry.id);
    } catch (deleteError) {
      console.error('Failed to delete guest roster entry', deleteError);
      setRowErrors((prev) => ({ ...prev, [entry.id]: labels.deleteError }));
      setSavingId(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{labels.title}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {isSyncing ? labels.syncing : labels.syncButton}
          </button>
          <button
            type="button"
            onClick={handleLink}
            disabled={isLinking}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {isLinking ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
            {isLinking ? labels.linking : labels.linkButton}
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className={`px-5 py-2 text-sm ${syncIsError ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
          {syncMessage}
        </div>
      )}

      {linkMessage && (
        <div className={`px-5 py-2 text-sm ${linkIsError ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
          {linkMessage}
        </div>
      )}

      {resetSideMessage && (
        <div className={`px-5 py-2 text-sm ${resetSideIsError ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
          {resetSideMessage}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 p-8 text-gray-600 dark:text-slate-400">
          <span className="h-5 w-5 rounded-full border-2 border-gray-200 border-t-gray-700 animate-spin dark:border-slate-700 dark:border-t-slate-300" />
          <span>{labels.loading}</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="p-8 text-center text-gray-600 dark:text-slate-400">{labels.noRecords}</div>
      ) : (
        <div className="space-y-6 p-5">
          {/* 1. Overall totals */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-slate-300">{labels.overallHeading}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <BigStatCard icon={Users} label={labels.totalInvited} value={overallTotals.invited} tone="blue" />
              <BigStatCard icon={UserCheck} label={labels.confirmed} value={overallTotals.confirmed} tone="emerald" />
              <BigStatCard icon={UserX} label={labels.declined} value={overallTotals.declined} tone="rose" />
              <BigStatCard icon={Clock} label={labels.pending} value={overallTotals.pending} tone="gray" />
            </div>
          </div>

          {/* 2. Side-by-side comparison */}
          {sides.length > 1 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-slate-300">{labels.sideBreakdown}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {sides.map((side) => {
                  const totals = sideTotals.get(side) ?? emptyTotals();
                  const total = totals.invited || 1;
                  const confirmedPct = (totals.confirmed / total) * 100;
                  const declinedPct = (totals.declined / total) * 100;
                  const pendingPct = (totals.pending / total) * 100;
                  return (
                    <div key={side} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                      <div className="mb-2 flex items-baseline justify-between">
                        <p className="font-semibold text-gray-900 dark:text-slate-100">{side}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{totals.invited} {labels.totalInvited}</p>
                      </div>
                      <div className="mb-3 flex h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                        <div className="h-full bg-emerald-500" style={{ width: `${confirmedPct}%` }} />
                        <div className="h-full bg-rose-400" style={{ width: `${declinedPct}%` }} />
                        <div className="h-full bg-slate-400" style={{ width: `${pendingPct}%` }} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{totals.confirmed}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">{labels.confirmed}</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-rose-600 dark:text-rose-400">{totals.declined}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">{labels.declined}</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-slate-600 dark:text-slate-300">{totals.pending}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">{labels.pending}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Search, filter, add */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-slate-300">{labels.filterHeading}</h3>
            <div className="space-y-2">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={labels.searchPlaceholder}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
              />
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <select
                  value={sideFilter}
                  onChange={(event) => {
                    setSideFilter(event.target.value);
                    // Clear any category picked for the previous side so a
                    // now-irrelevant category can't stay selected silently.
                    setCategoryFilter('');
                  }}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-slate-500 dark:focus:ring-slate-700"
                >
                  <option value="">{labels.allSides}</option>
                  {sides.map((side) => (
                    <option key={side} value={side}>{side}</option>
                  ))}
                </select>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-slate-500 dark:focus:ring-slate-700"
                >
                  <option value="">{labels.allCategories}</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-slate-500 dark:focus:ring-slate-700"
                >
                  <option value="">{labels.allStatuses}</option>
                  <option value="yes">{labels.statusConfirmed}</option>
                  <option value="no">{labels.statusDeclined}</option>
                  <option value="pending">{labels.statusPending}</option>
                </select>
                <button
                  type="button"
                  onClick={() => setIsAddFormOpen((open) => !open)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Plus size={16} />
                  {labels.addGuest}
                </button>
                {/* Reset-side button hidden per Gil's request (not needed right now).
                    Change SHOW_RESET_SIDE_BUTTON to true to bring it back. */}
                {SHOW_RESET_SIDE_BUTTON && sideFilter && (
                  <button
                    type="button"
                    onClick={handleResetSide}
                    disabled={isResettingSide}
                    className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60 sm:col-span-1 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
                  >
                    {isResettingSide ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    {isResettingSide ? labels.resettingSide : labels.resetSideButton}
                  </button>
                )}
              </div>
            </div>

            {isAddFormOpen && (
              <form onSubmit={handleAddSubmit} className="mt-3 rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-4 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <input
                    list="guest-roster-sides"
                    value={addForm.side}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, side: event.target.value }))}
                    placeholder={labels.side}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
                  />
                  <datalist id="guest-roster-sides">
                    {sides.map((side) => <option key={side} value={side} />)}
                  </datalist>
                  <input
                    list="guest-roster-categories"
                    value={addForm.category}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, category: event.target.value }))}
                    placeholder={labels.category}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
                  />
                  <datalist id="guest-roster-categories">
                    {categories.map((category) => <option key={category} value={category} />)}
                  </datalist>
                  <input
                    value={addForm.firstName}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, firstName: event.target.value }))}
                    placeholder={labels.firstName}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
                  />
                  <input
                    value={addForm.lastName}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, lastName: event.target.value }))}
                    placeholder={labels.lastName}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
                  />
                  <input
                    type="number"
                    min={1}
                    value={addForm.invitedCount}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, invitedCount: event.target.value }))}
                    placeholder={labels.invitedCount}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
                  />
                  <select
                    value={addForm.knownResponse}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, knownResponse: event.target.value as '' | KnownResponse }))}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-slate-500 dark:focus:ring-slate-700"
                  >
                    <option value="">{labels.statusPending}</option>
                    <option value="yes">{labels.statusConfirmed}</option>
                    <option value="no">{labels.statusDeclined}</option>
                  </select>
                </div>

                {addError && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{addError}</p>}

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isAdding}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    {isAdding && <Loader2 size={16} className="animate-spin" />}
                    {isAdding ? labels.saving : labels.addSubmit}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddFormOpen(false);
                      setAddForm(emptyForm);
                      setAddError('');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <X size={16} />
                    {labels.cancel}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* 4. Full guest list - collapsible (auto-shown once searching/filtering) */}
          <div>
            {filteredEntries.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                >
                  <MessageCircle size={16} />
                  שלח רשימה בווטסאפ
                </button>
                <button
                  type="button"
                  onClick={handleCopyList}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {isCopied ? <Check size={16} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={16} />}
                  {isCopied ? 'הועתק' : 'העתק טקסט'}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsListOpen((open) => !open)}
              className="flex w-full items-center justify-between rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <span>{labels.fullList} ({filteredEntries.length} {labels.records} · {filteredInvitedTotal} {labels.totalInvited})</span>
              <ChevronDown size={16} className={`transition-transform ${isListVisible ? 'rotate-180' : ''}`} />
            </button>

            {isListVisible && (
              <div className="mt-2">
                {/* Mobile card list */}
                <div className="max-h-96 divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-100 md:hidden dark:divide-slate-700 dark:border-slate-700">
                  {filteredEntries.map((entry) => {
                    const isSaving = savingId === entry.id;
                    const rowError = rowErrors[entry.id];
                    const isExpanded = expandedEntryIds.has(entry.id);
                    const fullName = `${entry.firstName} ${entry.lastName}`.trim() || labels.name;
                    return (
                      <div key={entry.id} className="p-3">
                        <button
                          type="button"
                          onClick={() => toggleEntryExpanded(entry.id)}
                          className="flex w-full items-center gap-2 text-start"
                          aria-expanded={isExpanded}
                        >
                          <ChevronDown
                            size={16}
                            className={`shrink-0 text-gray-400 transition-transform dark:text-slate-500 ${isExpanded ? 'rotate-180' : ''}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-gray-900 dark:text-slate-100">{fullName}</span>
                            <span className="block truncate text-xs text-gray-500 dark:text-slate-400">{entry.side} · {entry.category}</span>
                          </span>
                          <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-slate-400" dir="ltr">×{entry.invitedCount}</span>
                          <span className="shrink-0">{statusBadge(entry.knownResponse)}</span>
                        </button>

                        {isExpanded && (
                          <div className="mt-3 border-t border-gray-100 pt-3 dark:border-slate-700">
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                defaultValue={entry.firstName}
                                key={`${entry.id}-first-${entry.firstName}`}
                                disabled={isSaving}
                                placeholder={labels.firstName}
                                onBlur={(event) => handleNameChange(entry, event.target.value, entry.lastName)}
                                className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                              />
                              <input
                                type="text"
                                defaultValue={entry.lastName}
                                key={`${entry.id}-last-${entry.lastName}`}
                                disabled={isSaving}
                                placeholder={labels.lastName}
                                onBlur={(event) => handleNameChange(entry, entry.firstName, event.target.value)}
                                className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                              />
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              <div>
                                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">{labels.invitedCount}</p>
                                <input
                                  type="number"
                                  min={1}
                                  defaultValue={entry.invitedCount}
                                  key={`${entry.id}-${entry.invitedCount}`}
                                  disabled={isSaving}
                                  onBlur={(event) => handleCountChange(entry, event.target.value)}
                                  className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                                />
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">{labels.status}</p>
                                <select
                                  value={entry.knownResponse ?? ''}
                                  disabled={isSaving}
                                  onChange={(event) => handleStatusChange(entry, event.target.value)}
                                  className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-slate-500 dark:focus:ring-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                                >
                                  <option value="">{labels.statusPending}</option>
                                  <option value="yes">{labels.statusConfirmed}</option>
                                  <option value="no">{labels.statusDeclined}</option>
                                </select>
                              </div>
                            </div>
                            {rowError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{rowError}</p>}
                            <button
                              type="button"
                              onClick={() => handleDelete(entry)}
                              disabled={isSaving}
                              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-100 px-3 py-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
                            >
                              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              {labels.deleteAction}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden max-h-96 overflow-y-auto overflow-x-auto rounded-2xl border border-gray-100 md:block dark:border-slate-700">
                  <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
                    <thead className="sticky top-0 bg-gray-50/95 text-gray-600 backdrop-blur dark:bg-slate-800/95 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2 text-start font-semibold">{labels.name}</th>
                        <th className="px-4 py-2 text-start font-semibold">{labels.side}</th>
                        <th className="px-4 py-2 text-start font-semibold">{labels.category}</th>
                        <th className="px-4 py-2 text-center font-semibold">{labels.invitedCount}</th>
                        <th className="px-4 py-2 text-start font-semibold">{labels.status}</th>
                        <th className="px-4 py-2 text-center font-semibold">{labels.actions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white dark:divide-slate-700 dark:bg-slate-900">
                      {filteredEntries.map((entry) => {
                        const isSaving = savingId === entry.id;
                        const rowError = rowErrors[entry.id];
                        return (
                          <tr key={entry.id}>
                            <td className="px-4 py-2 font-medium text-gray-900 dark:text-slate-100">
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  defaultValue={entry.firstName}
                                  key={`${entry.id}-first-${entry.firstName}`}
                                  disabled={isSaving}
                                  placeholder={labels.firstName}
                                  onBlur={(event) => handleNameChange(entry, event.target.value, entry.lastName)}
                                  className="w-24 min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                                />
                                <input
                                  type="text"
                                  defaultValue={entry.lastName}
                                  key={`${entry.id}-last-${entry.lastName}`}
                                  disabled={isSaving}
                                  placeholder={labels.lastName}
                                  onBlur={(event) => handleNameChange(entry, entry.firstName, event.target.value)}
                                  className="w-24 min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2 text-gray-700 dark:text-slate-300">{entry.side}</td>
                            <td className="px-4 py-2 text-gray-700 dark:text-slate-300">{entry.category}</td>
                            <td className="px-4 py-2 text-center">
                              <input
                                type="number"
                                min={1}
                                defaultValue={entry.invitedCount}
                                key={`${entry.id}-${entry.invitedCount}`}
                                disabled={isSaving}
                                onBlur={(event) => handleCountChange(entry, event.target.value)}
                                className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <select
                                value={entry.knownResponse ?? ''}
                                disabled={isSaving}
                                onChange={(event) => handleStatusChange(entry, event.target.value)}
                                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-slate-500 dark:focus:ring-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                              >
                                <option value="">{labels.statusPending}</option>
                                <option value="yes">{labels.statusConfirmed}</option>
                                <option value="no">{labels.statusDeclined}</option>
                              </select>
                              {rowError && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{rowError}</p>}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleDelete(entry)}
                                disabled={isSaving}
                                title={labels.deleteAction}
                                className="inline-flex items-center justify-center rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-950/40"
                              >
                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
