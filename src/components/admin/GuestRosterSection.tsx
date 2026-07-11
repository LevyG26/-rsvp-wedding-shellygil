import { useMemo, useState } from 'react';
import { ChevronDown, Clock, Link2, Loader2, Plus, RefreshCw, Trash2, UserCheck, Users, UserX, X } from 'lucide-react';
import type { GuestRosterEntry, GuestRosterEntryInput, KnownResponse } from '../../services/guestRoster';
import type { RosterLinkResult } from '../../services/rsvpRosterLink';

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
  blue: 'border-blue-100 bg-blue-50 text-blue-700',
  emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  rose: 'border-rose-100 bg-rose-50 text-rose-700',
  gray: 'border-gray-100 bg-gray-50 text-gray-700',
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
    <div className="rounded-2xl border border-white/40 bg-white/80 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accentClassName}`}>{value}</p>
    </div>
  );
}

const emptyForm = { side: '', category: '', firstName: '', lastName: '', invitedCount: '1', knownResponse: '' as '' | KnownResponse };

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

  const statusBadge = (response: GuestRosterEntry['knownResponse']) => {
    if (response === 'yes') {
      return <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">{labels.statusConfirmed}</span>;
    }
    if (response === 'no') {
      return <span className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700">{labels.statusDeclined}</span>;
    }
    return <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{labels.statusPending}</span>;
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
      if (result.updatedCount > 0) {
        const ambiguousSuffix = result.ambiguousCount > 0 ? ` (${labels.linkAmbiguous}: ${result.ambiguousCount})` : '';
        setLinkMessage(`${labels.linkUpdated}: ${result.updatedCount}${ambiguousSuffix}`);
      } else if (result.ambiguousCount > 0) {
        setLinkMessage(`${labels.linkNone} (${labels.linkAmbiguous}: ${result.ambiguousCount})`);
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
    <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{labels.title}</h2>
          <p className="mt-1 text-sm text-gray-500">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {isSyncing ? labels.syncing : labels.syncButton}
          </button>
          <button
            type="button"
            onClick={handleLink}
            disabled={isLinking}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {isLinking ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
            {isLinking ? labels.linking : labels.linkButton}
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className={`px-5 py-2 text-sm ${syncIsError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {syncMessage}
        </div>
      )}

      {linkMessage && (
        <div className={`px-5 py-2 text-sm ${linkIsError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {linkMessage}
        </div>
      )}

      {resetSideMessage && (
        <div className={`px-5 py-2 text-sm ${resetSideIsError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {resetSideMessage}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 p-8 text-gray-600">
          <span className="h-5 w-5 rounded-full border-2 border-gray-200 border-t-gray-700 animate-spin" />
          <span>{labels.loading}</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="p-8 text-center text-gray-600">{labels.noRecords}</div>
      ) : (
        <div className="space-y-6 p-5">
          {/* 1. Overall totals */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">{labels.overallHeading}</h3>
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
              <h3 className="mb-2 text-sm font-semibold text-gray-700">{labels.sideBreakdown}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {sides.map((side) => {
                  const totals = sideTotals.get(side) ?? emptyTotals();
                  const total = totals.invited || 1;
                  const confirmedPct = (totals.confirmed / total) * 100;
                  const declinedPct = (totals.declined / total) * 100;
                  const pendingPct = (totals.pending / total) * 100;
                  return (
                    <div key={side} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
                      <div className="mb-2 flex items-baseline justify-between">
                        <p className="font-semibold text-gray-900">{side}</p>
                        <p className="text-xs text-gray-500">{totals.invited} {labels.totalInvited}</p>
                      </div>
                      <div className="mb-3 flex h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                        <div className="h-full bg-emerald-500" style={{ width: `${confirmedPct}%` }} />
                        <div className="h-full bg-rose-400" style={{ width: `${declinedPct}%` }} />
                        <div className="h-full bg-slate-400" style={{ width: `${pendingPct}%` }} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-lg font-semibold text-emerald-600">{totals.confirmed}</p>
                          <p className="text-xs text-gray-500">{labels.confirmed}</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-rose-600">{totals.declined}</p>
                          <p className="text-xs text-gray-500">{labels.declined}</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-slate-600">{totals.pending}</p>
                          <p className="text-xs text-gray-500">{labels.pending}</p>
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
            <h3 className="mb-2 text-sm font-semibold text-gray-700">{labels.filterHeading}</h3>
            <div className="space-y-2">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={labels.searchPlaceholder}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
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
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                >
                  <option value="">{labels.allSides}</option>
                  {sides.map((side) => (
                    <option key={side} value={side}>{side}</option>
                  ))}
                </select>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                >
                  <option value="">{labels.allCategories}</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                >
                  <option value="">{labels.allStatuses}</option>
                  <option value="yes">{labels.statusConfirmed}</option>
                  <option value="no">{labels.statusDeclined}</option>
                  <option value="pending">{labels.statusPending}</option>
                </select>
                <button
                  type="button"
                  onClick={() => setIsAddFormOpen((open) => !open)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
                    className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60 sm:col-span-1"
                  >
                    {isResettingSide ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    {isResettingSide ? labels.resettingSide : labels.resetSideButton}
                  </button>
                )}
              </div>
            </div>

            {isAddFormOpen && (
              <form onSubmit={handleAddSubmit} className="mt-3 rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <input
                    list="guest-roster-sides"
                    value={addForm.side}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, side: event.target.value }))}
                    placeholder={labels.side}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                  />
                  <datalist id="guest-roster-sides">
                    {sides.map((side) => <option key={side} value={side} />)}
                  </datalist>
                  <input
                    list="guest-roster-categories"
                    value={addForm.category}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, category: event.target.value }))}
                    placeholder={labels.category}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                  />
                  <datalist id="guest-roster-categories">
                    {categories.map((category) => <option key={category} value={category} />)}
                  </datalist>
                  <input
                    value={addForm.firstName}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, firstName: event.target.value }))}
                    placeholder={labels.firstName}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                  />
                  <input
                    value={addForm.lastName}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, lastName: event.target.value }))}
                    placeholder={labels.lastName}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                  />
                  <input
                    type="number"
                    min={1}
                    value={addForm.invitedCount}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, invitedCount: event.target.value }))}
                    placeholder={labels.invitedCount}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                  />
                  <select
                    value={addForm.knownResponse}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, knownResponse: event.target.value as '' | KnownResponse }))}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                  >
                    <option value="">{labels.statusPending}</option>
                    <option value="yes">{labels.statusConfirmed}</option>
                    <option value="no">{labels.statusDeclined}</option>
                  </select>
                </div>

                {addError && <p className="mt-2 text-sm text-rose-600">{addError}</p>}

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isAdding}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
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
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
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
            <button
              type="button"
              onClick={() => setIsListOpen((open) => !open)}
              className="flex w-full items-center justify-between rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              <span>{labels.fullList} ({filteredEntries.length} {labels.records} · {filteredInvitedTotal} {labels.totalInvited})</span>
              <ChevronDown size={16} className={`transition-transform ${isListVisible ? 'rotate-180' : ''}`} />
            </button>

            {isListVisible && (
              <div className="mt-2">
                {/* Mobile card list */}
                <div className="max-h-96 divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-100 md:hidden">
                  {filteredEntries.map((entry) => {
                    const isSaving = savingId === entry.id;
                    const rowError = rowErrors[entry.id];
                    return (
                      <div key={entry.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                defaultValue={entry.firstName}
                                key={`${entry.id}-first-${entry.firstName}`}
                                disabled={isSaving}
                                placeholder={labels.firstName}
                                onBlur={(event) => handleNameChange(entry, event.target.value, entry.lastName)}
                                className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
                              />
                              <input
                                type="text"
                                defaultValue={entry.lastName}
                                key={`${entry.id}-last-${entry.lastName}`}
                                disabled={isSaving}
                                placeholder={labels.lastName}
                                onBlur={(event) => handleNameChange(entry, entry.firstName, event.target.value)}
                                className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
                              />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">{entry.side} · {entry.category}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDelete(entry)}
                            disabled={isSaving}
                            title={labels.deleteAction}
                            className="inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                          >
                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div>
                            <p className="mb-1 text-xs font-medium text-gray-500">{labels.invitedCount}</p>
                            <input
                              type="number"
                              min={1}
                              defaultValue={entry.invitedCount}
                              key={`${entry.id}-${entry.invitedCount}`}
                              disabled={isSaving}
                              onBlur={(event) => handleCountChange(entry, event.target.value)}
                              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
                            />
                          </div>
                          <div>
                            <p className="mb-1 text-xs font-medium text-gray-500">{labels.status}</p>
                            <select
                              value={entry.knownResponse ?? ''}
                              disabled={isSaving}
                              onChange={(event) => handleStatusChange(entry, event.target.value)}
                              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
                            >
                              <option value="">{labels.statusPending}</option>
                              <option value="yes">{labels.statusConfirmed}</option>
                              <option value="no">{labels.statusDeclined}</option>
                            </select>
                          </div>
                        </div>
                        {rowError && <p className="mt-2 text-xs text-rose-600">{rowError}</p>}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden max-h-96 overflow-y-auto overflow-x-auto rounded-2xl border border-gray-100 md:block">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="sticky top-0 bg-gray-50/95 text-gray-600 backdrop-blur">
                      <tr>
                        <th className="px-4 py-2 text-start font-semibold">{labels.name}</th>
                        <th className="px-4 py-2 text-start font-semibold">{labels.side}</th>
                        <th className="px-4 py-2 text-start font-semibold">{labels.category}</th>
                        <th className="px-4 py-2 text-center font-semibold">{labels.invitedCount}</th>
                        <th className="px-4 py-2 text-start font-semibold">{labels.status}</th>
                        <th className="px-4 py-2 text-center font-semibold">{labels.actions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {filteredEntries.map((entry) => {
                        const isSaving = savingId === entry.id;
                        const rowError = rowErrors[entry.id];
                        return (
                          <tr key={entry.id}>
                            <td className="px-4 py-2 font-medium text-gray-900">
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  defaultValue={entry.firstName}
                                  key={`${entry.id}-first-${entry.firstName}`}
                                  disabled={isSaving}
                                  placeholder={labels.firstName}
                                  onBlur={(event) => handleNameChange(entry, event.target.value, entry.lastName)}
                                  className="w-24 min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
                                />
                                <input
                                  type="text"
                                  defaultValue={entry.lastName}
                                  key={`${entry.id}-last-${entry.lastName}`}
                                  disabled={isSaving}
                                  placeholder={labels.lastName}
                                  onBlur={(event) => handleNameChange(entry, entry.firstName, event.target.value)}
                                  className="w-24 min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2 text-gray-700">{entry.side}</td>
                            <td className="px-4 py-2 text-gray-700">{entry.category}</td>
                            <td className="px-4 py-2 text-center">
                              <input
                                type="number"
                                min={1}
                                defaultValue={entry.invitedCount}
                                key={`${entry.id}-${entry.invitedCount}`}
                                disabled={isSaving}
                                onBlur={(event) => handleCountChange(entry, event.target.value)}
                                className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <select
                                value={entry.knownResponse ?? ''}
                                disabled={isSaving}
                                onChange={(event) => handleStatusChange(entry, event.target.value)}
                                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
                              >
                                <option value="">{labels.statusPending}</option>
                                <option value="yes">{labels.statusConfirmed}</option>
                                <option value="no">{labels.statusDeclined}</option>
                              </select>
                              {rowError && <p className="mt-1 text-xs text-rose-600">{rowError}</p>}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleDelete(entry)}
                                disabled={isSaving}
                                title={labels.deleteAction}
                                className="inline-flex items-center justify-center rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-60"
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
