import { useMemo, useState } from 'react';
import { ChevronDown, Loader2, Search, Trash2 } from 'lucide-react';
import type { GuestRosterEntry } from '../../services/guestRoster';
import { findLikelyDuplicateGroups } from '../../services/duplicateDetection';

interface DuplicateFinderPanelProps {
  entries: GuestRosterEntry[];
  onDelete: (id: string) => Promise<void>;
}

// One-off admin utility: scans one side for entries that likely refer to
// the same guest (same fuzzy name-matching used everywhere else in this
// app), so a rename-created orphan row can be spotted and removed without
// wiping and re-importing the whole side.
export function DuplicateFinderPanel({ entries, onDelete }: DuplicateFinderPanelProps) {
  const sides = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.side).filter(Boolean))).sort(),
    [entries],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [side, setSide] = useState(() => (sides.includes('גיל') ? 'גיל' : sides[0] ?? ''));
  const [groups, setGroups] = useState<GuestRosterEntry[][] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleScan = () => {
    setError('');
    try {
      setGroups(findLikelyDuplicateGroups(entries, side));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בסריקה.');
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError('');
    try {
      await onDelete(id);
      setGroups((current) =>
        current
          ? current
              .map((group) => group.filter((entry) => entry.id !== id))
              .filter((group) => group.length > 1)
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה במחיקה.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-3xl border border-white/30 bg-white/90 shadow-xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between px-5 py-4 text-start"
      >
        <div>
          <p className="font-semibold text-gray-900 dark:text-slate-100">איתור כפילויות אפשריות</p>
          <p className="text-xs text-gray-500 dark:text-slate-400">מוצא רשומות שכנראה אותו אדם (למשל אחרי שינוי שם בגיליון)</p>
        </div>
        <ChevronDown size={18} className={`text-gray-500 dark:text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="space-y-4 border-t border-gray-100 px-5 py-4 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-slate-400">צד:</label>
            <select
              value={side}
              onChange={(event) => {
                setSide(event.target.value);
                setGroups(null);
              }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-400 dark:focus:ring-slate-700"
            >
              {sides.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleScan}
              disabled={!side}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Search size={16} />
              סרוק כפילויות
            </button>
          </div>

          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

          {groups && (
            groups.length === 0 ? (
              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300">לא נמצאו כפילויות אפשריות בצד {side}.</div>
            ) : (
              <div className="space-y-3">
                {groups.map((group, groupIndex) => (
                  <div key={groupIndex} className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/40">
                    <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-300">קבוצה אפשרית #{groupIndex + 1} - תבדוק איזו רשומה נכונה ותמחק את השאר</p>
                    <div className="space-y-1.5">
                      {group.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-slate-900">
                          <div>
                            <span className="font-medium text-gray-900 dark:text-slate-100">{entry.firstName} {entry.lastName}</span>
                            <span className="ms-2 text-xs text-gray-500 dark:text-slate-400">{entry.category} · כמות {entry.invitedCount} · {entry.knownResponse === 'yes' ? 'מגיע/ה' : entry.knownResponse === 'no' ? 'לא מגיע/ה' : 'עדיין לא ענו'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.id)}
                            disabled={deletingId === entry.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-200 disabled:opacity-60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40"
                          >
                            {deletingId === entry.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            מחק
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
