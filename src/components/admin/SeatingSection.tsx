import { useMemo, useState } from 'react';
import { Check, LayoutGrid, Loader2, Pencil, Plus, Trash2, UserCheck, Users, X } from 'lucide-react';
import type { GuestRosterEntry } from '../../services/guestRoster';
import type { SeatingAssignment, SeatingGroup, SeatingTable } from '../../services/seating';

export interface SeatingLabels {
  title: string;
  subtitle: string;
  loading: string;
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
  groupsHeading: string;
  addGroupButton: string;
  groupNamePlaceholder: string;
  groupMembersHint: string;
  saveGroup: string;
  cancelAction: string;
  editAction: string;
  deleteAction: string;
  assignButton: string;
  noGroups: string;
  membersCountLabel: string;
  tablesHeading: string;
  addTableButton: string;
  tableNamePlaceholder: string;
  tableSeatsPlaceholder: string;
  saveTable: string;
  noTables: string;
  tableFullBadge: string;
  deleteTableConfirm: string;
  deleteGroupConfirm: string;
  updateError: string;
  createError: string;
  deleteError: string;
  saving: string;
}

interface SeatingSectionProps {
  confirmedEntries: GuestRosterEntry[];
  tables: SeatingTable[];
  groups: SeatingGroup[];
  assignments: SeatingAssignment[];
  isLoading: boolean;
  locale: string;
  labels: SeatingLabels;
  onCreateTable: (name: string, seatCount: number) => Promise<void>;
  onUpdateTable: (id: string, name: string, seatCount: number) => Promise<void>;
  onDeleteTable: (id: string) => Promise<void>;
  onCreateGroup: (name: string, memberEntryIds: string[]) => Promise<void>;
  onUpdateGroup: (id: string, name: string, memberEntryIds: string[]) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
  onSetAssignment: (rosterEntryId: string, tableId: string, seatsCount: number) => Promise<void>;
  onRemoveAssignment: (rosterEntryId: string, tableId: string) => Promise<void>;
  onAssignGroupToTable: (group: SeatingGroup, tableId: string) => Promise<void>;
}

function entryName(entry: GuestRosterEntry): string {
  return `${entry.firstName} ${entry.lastName}`.trim() || '-';
}

const emptyTableForm = { name: '', seatCount: '8' };
const emptyGroupForm = { name: '', memberEntryIds: new Set<string>() };

export function SeatingSection({
  confirmedEntries,
  tables,
  groups,
  assignments,
  isLoading,
  locale,
  labels,
  onCreateTable,
  onUpdateTable,
  onDeleteTable,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onSetAssignment,
  onRemoveAssignment,
  onAssignGroupToTable,
}: SeatingSectionProps) {
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

  const [isGroupFormOpen, setIsGroupFormOpen] = useState(false);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const [groupSearch, setGroupSearch] = useState('');
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [groupFormError, setGroupFormError] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupAssignTableId, setGroupAssignTableId] = useState<Record<string, string>>({});

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
  const totalTableCapacity = useMemo(() => tables.reduce((sum, table) => sum + table.seatCount, 0), [tables]);
  const totalSeatsAvailable = Math.max(0, totalTableCapacity - totalSeatedPeople);

  const sortedTables = useMemo(() => [...tables].sort((a, b) => a.name.localeCompare(b.name, locale)), [tables, locale]);
  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.name.localeCompare(b.name, locale)), [groups, locale]);

  const unseatedEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return confirmedEntries
      .filter((entry) => remainingForEntry(entry) > 0)
      .filter((entry) => {
        if (!query) return true;
        return entryName(entry).toLowerCase().includes(query) || entry.category.toLowerCase().includes(query);
      })
      .sort((a, b) => entryName(a).localeCompare(entryName(b), locale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedEntries, search, locale, seatsAssignedByEntry]);

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
      await onCreateTable(tableForm.name.trim(), Number.isFinite(seatCount) && seatCount > 0 ? seatCount : 8);
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
    setEditTableForm({ name: table.name, seatCount: String(table.seatCount) });
  };

  const handleSaveTableEdit = async (tableId: string) => {
    const seatCount = Number.parseInt(editTableForm.seatCount, 10);
    const key = `table-${tableId}`;
    setBusyKey(key);
    setErrorByKey((prev) => ({ ...prev, [key]: '' }));
    try {
      await onUpdateTable(tableId, editTableForm.name.trim() || labels.tableNamePlaceholder, Number.isFinite(seatCount) && seatCount > 0 ? seatCount : 1);
      setEditingTableId(null);
    } catch (error) {
      console.error('Failed to update table', error);
      setErrorByKey((prev) => ({ ...prev, [key]: labels.updateError }));
    } finally {
      setBusyKey(null);
    }
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

  const filteredGroupCandidates = useMemo(() => {
    const query = groupSearch.trim().toLowerCase();
    return confirmedEntries
      .filter((entry) => !query || entryName(entry).toLowerCase().includes(query) || entry.category.toLowerCase().includes(query))
      .sort((a, b) => entryName(a).localeCompare(entryName(b), locale));
  }, [confirmedEntries, groupSearch, locale]);

  const toggleGroupMember = (entryId: string) => {
    setGroupForm((prev) => {
      const next = new Set(prev.memberEntryIds);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return { ...prev, memberEntryIds: next };
    });
  };

  const handleSaveGroup = async () => {
    setGroupFormError('');
    if (!groupForm.name.trim() || groupForm.memberEntryIds.size === 0) {
      setGroupFormError(labels.createError);
      return;
    }
    setIsSavingGroup(true);
    try {
      const memberIds = Array.from(groupForm.memberEntryIds);
      if (editingGroupId) {
        await onUpdateGroup(editingGroupId, groupForm.name.trim(), memberIds);
      } else {
        await onCreateGroup(groupForm.name.trim(), memberIds);
      }
      setGroupForm(emptyGroupForm);
      setIsGroupFormOpen(false);
      setEditingGroupId(null);
    } catch (error) {
      console.error('Failed to save seating group', error);
      setGroupFormError(labels.createError);
    } finally {
      setIsSavingGroup(false);
    }
  };

  const startEditingGroup = (group: SeatingGroup) => {
    setEditingGroupId(group.id);
    setGroupForm({ name: group.name, memberEntryIds: new Set(group.memberEntryIds) });
    setIsGroupFormOpen(true);
  };

  const handleDeleteGroup = async (group: SeatingGroup) => {
    if (typeof window !== 'undefined' && !window.confirm(labels.deleteGroupConfirm)) return;
    const key = `group-${group.id}`;
    setBusyKey(key);
    try {
      await onDeleteGroup(group.id);
    } catch (error) {
      console.error('Failed to delete seating group', error);
      setErrorByKey((prev) => ({ ...prev, [key]: labels.deleteError }));
    } finally {
      setBusyKey(null);
    }
  };

  const handleAssignGroup = async (group: SeatingGroup) => {
    const tableId = groupAssignTableId[group.id];
    const table = tables.find((candidate) => candidate.id === tableId);
    if (!table) return;
    const key = `group-assign-${group.id}`;
    setBusyKey(key);
    setErrorByKey((prev) => ({ ...prev, [key]: '' }));
    try {
      await onAssignGroupToTable(group, table.id);
    } catch (error) {
      console.error('Failed to assign seating group to table', error);
      setErrorByKey((prev) => ({ ...prev, [key]: labels.updateError }));
    } finally {
      setBusyKey(null);
    }
  };

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-center gap-3 p-8 text-gray-600">
          <span className="h-5 w-5 rounded-full border-2 border-gray-200 border-t-gray-700 animate-spin" />
          <span>{labels.loading}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-900">{labels.title}</h2>
        <p className="mt-1 text-sm text-gray-500">{labels.subtitle}</p>
      </div>

      <div className="space-y-6 p-5">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-700">
            <Users size={20} className="opacity-80" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-70">{labels.statConfirmed}</p>
            <p className="mt-1 text-3xl font-semibold">{totalConfirmedPeople}</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-700">
            <UserCheck size={20} className="opacity-80" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-70">{labels.statSeated}</p>
            <p className="mt-1 text-3xl font-semibold">{totalSeatedPeople}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-amber-700">
            <Users size={20} className="opacity-80" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-70">{labels.statUnseated}</p>
            <p className="mt-1 text-3xl font-semibold">{totalUnseatedPeople}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-gray-700">
            <LayoutGrid size={20} className="opacity-80" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-70">{labels.statTables}</p>
            <p className="mt-1 text-3xl font-semibold">{tables.length}</p>
            <p className="text-xs opacity-70">{totalSeatsAvailable} {labels.statSeatsAvailable}</p>
          </div>
        </div>

        {/* Unseated pool */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">{labels.unseatedHeading} ({unseatedEntries.length})</h3>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="mb-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
          />
          {unseatedEntries.length === 0 ? (
            <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{labels.unseatedAllSeated}</p>
          ) : (
            <div className="max-h-96 divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-100">
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
                      <p className="truncate text-sm font-medium text-gray-900">{entryName(entry)}</p>
                      <p className="truncate text-xs text-gray-500">
                        {entry.side} · {entry.category} · {labels.remainingOf.replace('{remaining}', String(remaining)).replace('{total}', String(entry.invitedCount))}
                      </p>
                      {rowError && <p className="text-xs text-rose-600">{rowError}</p>}
                    </div>
                    {tablesWithRoom.length === 0 ? (
                      <p className="shrink-0 text-xs text-gray-400">{labels.noTablesHint}</p>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={remaining}
                          value={state.seats}
                          onChange={(event) => setRowField(entry.id, 'seats', event.target.value)}
                          disabled={isBusy}
                          className="w-14 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
                        />
                        <select
                          value={state.tableId}
                          onChange={(event) => setRowField(entry.id, 'tableId', event.target.value)}
                          disabled={isBusy}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
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
                          className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
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

        {/* Seating groups */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">{labels.groupsHeading} ({groups.length})</h3>
            <button
              type="button"
              onClick={() => {
                if (isGroupFormOpen && !editingGroupId) {
                  setIsGroupFormOpen(false);
                } else {
                  setGroupForm(emptyGroupForm);
                  setEditingGroupId(null);
                  setIsGroupFormOpen(true);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus size={14} />
              {labels.addGroupButton}
            </button>
          </div>

          {isGroupFormOpen && (
            <div className="mb-3 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
              <input
                type="text"
                value={groupForm.name}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder={labels.groupNamePlaceholder}
                className="mb-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
              />
              <p className="mb-1 text-xs text-gray-500">{labels.groupMembersHint}</p>
              <input
                type="text"
                value={groupSearch}
                onChange={(event) => setGroupSearch(event.target.value)}
                placeholder={labels.searchPlaceholder}
                className="mb-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
              />
              <div className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200 bg-white">
                {filteredGroupCandidates.map((entry) => (
                  <label key={entry.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={groupForm.memberEntryIds.has(entry.id)}
                      onChange={() => toggleGroupMember(entry.id)}
                      className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300"
                    />
                    <span className="min-w-0 flex-1 truncate text-gray-900">{entryName(entry)}</span>
                    <span className="shrink-0 text-xs text-gray-500">{entry.category}</span>
                  </label>
                ))}
              </div>
              {groupFormError && <p className="mt-2 text-sm text-rose-600">{groupFormError}</p>}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveGroup}
                  disabled={isSavingGroup}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  {isSavingGroup && <Loader2 size={16} className="animate-spin" />}
                  {isSavingGroup ? labels.saving : labels.saveGroup}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsGroupFormOpen(false);
                    setEditingGroupId(null);
                    setGroupForm(emptyGroupForm);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  <X size={16} />
                  {labels.cancelAction}
                </button>
              </div>
            </div>
          )}

          {groups.length === 0 && !isGroupFormOpen ? (
            <p className="text-sm text-gray-500">{labels.noGroups}</p>
          ) : (
            <div className="space-y-2">
              {sortedGroups.map((group) => {
                const tablesWithRoom = sortedTables.filter((table) => tableRemaining(table) > 0);
                const assignKey = `group-assign-${group.id}`;
                const deleteKey = `group-${group.id}`;
                return (
                  <div key={group.id} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{group.name}</p>
                        <p className="text-xs text-gray-500">{group.memberEntryIds.length} {labels.membersCountLabel}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEditingGroup(group)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <Pencil size={12} />
                          {labels.editAction}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteGroup(group)}
                          disabled={busyKey === deleteKey}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          {busyKey === deleteKey ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        </button>
                      </div>
                    </div>
                    {tablesWithRoom.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <select
                          value={groupAssignTableId[group.id] ?? ''}
                          onChange={(event) => setGroupAssignTableId((prev) => ({ ...prev, [group.id]: event.target.value }))}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        >
                          <option value="">{labels.chooseTable}</option>
                          {tablesWithRoom.map((table) => (
                            <option key={table.id} value={table.id}>{table.name} ({tableRemaining(table)} {labels.seatsWord})</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAssignGroup(group)}
                          disabled={busyKey === assignKey || !groupAssignTableId[group.id]}
                          className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
                        >
                          {busyKey === assignKey ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          {labels.assignButton}
                        </button>
                      </div>
                    )}
                    {errorByKey[assignKey] && <p className="mt-1 text-xs text-rose-600">{errorByKey[assignKey]}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tables */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">{labels.tablesHeading} ({tables.length})</h3>
            <button
              type="button"
              onClick={() => setIsTableFormOpen((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus size={14} />
              {labels.addTableButton}
            </button>
          </div>

          {isTableFormOpen && (
            <form onSubmit={handleCreateTableSubmit} className="mb-3 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  type="text"
                  value={tableForm.name}
                  onChange={(event) => setTableForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder={labels.tableNamePlaceholder}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                />
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={tableForm.seatCount}
                  onChange={(event) => setTableForm((prev) => ({ ...prev, seatCount: event.target.value }))}
                  placeholder={labels.tableSeatsPlaceholder}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                />
                <button
                  type="submit"
                  disabled={isSavingTable}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  {isSavingTable && <Loader2 size={16} className="animate-spin" />}
                  {isSavingTable ? labels.saving : labels.saveTable}
                </button>
              </div>
              {tableFormError && <p className="mt-2 text-sm text-rose-600">{tableFormError}</p>}
            </form>
          )}

          {tables.length === 0 ? (
            <p className="text-sm text-gray-500">{labels.noTables}</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedTables.map((table) => {
                const used = seatsUsedByTable.get(table.id) ?? 0;
                const isFull = used >= table.seatCount;
                const fillPct = table.seatCount > 0 ? Math.min(100, (used / table.seatCount) * 100) : 0;
                const tableAssignments = (assignmentsByTable.get(table.id) ?? []).slice().sort((a, b) => {
                  const nameA = entryName(entriesById.get(a.rosterEntryId) ?? ({ firstName: '', lastName: '' } as GuestRosterEntry));
                  const nameB = entryName(entriesById.get(b.rosterEntryId) ?? ({ firstName: '', lastName: '' } as GuestRosterEntry));
                  return nameA.localeCompare(nameB, locale);
                });
                const isEditing = editingTableId === table.id;
                const tableKey = `table-${table.id}`;

                return (
                  <div key={table.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    {isEditing ? (
                      <div className="mb-2 flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editTableForm.name}
                          onChange={(event) => setEditTableForm((prev) => ({ ...prev, name: event.target.value }))}
                          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-semibold text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        />
                        <input
                          type="number"
                          min={1}
                          max={40}
                          value={editTableForm.seatCount}
                          onChange={(event) => setEditTableForm((prev) => ({ ...prev, seatCount: event.target.value }))}
                          className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveTableEdit(table.id)}
                          disabled={busyKey === tableKey}
                          className="inline-flex shrink-0 items-center rounded-lg bg-gray-900 p-1.5 text-white hover:bg-gray-800 disabled:opacity-60"
                        >
                          {busyKey === tableKey ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTableId(null)}
                          className="inline-flex shrink-0 items-center rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900">{table.name}</p>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isFull ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                            {used}/{table.seatCount}
                            {isFull ? ` · ${labels.tableFullBadge}` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEditingTable(table)}
                            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTable(table)}
                            disabled={busyKey === tableKey}
                            className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 disabled:opacity-60"
                          >
                            {busyKey === tableKey ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className={`h-full ${isFull ? 'bg-emerald-500' : 'bg-blue-400'}`} style={{ width: `${fillPct}%` }} />
                    </div>

                    {errorByKey[tableKey] && <p className="mb-2 text-xs text-rose-600">{errorByKey[tableKey]}</p>}

                    {tableAssignments.length === 0 ? (
                      <p className="text-xs text-gray-400">{labels.unseatedEmpty}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {tableAssignments.map((assignment) => {
                          const entry = entriesById.get(assignment.rosterEntryId);
                          const assignmentKey = `assignment-${assignment.id}`;
                          return (
                            <div key={assignment.id} className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2 py-1.5">
                              <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{entry ? entryName(entry) : '-'}</span>
                              <input
                                type="number"
                                min={0}
                                defaultValue={assignment.seatsCount}
                                key={`${assignment.id}-${assignment.seatsCount}`}
                                disabled={busyKey === assignmentKey}
                                onBlur={(event) => handleAssignmentSeatsChange(assignment, event.target.value)}
                                className="w-12 shrink-0 rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-center text-xs text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveAssignment(assignment)}
                                disabled={busyKey === assignmentKey}
                                className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-200 hover:text-rose-600 disabled:opacity-60"
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
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
