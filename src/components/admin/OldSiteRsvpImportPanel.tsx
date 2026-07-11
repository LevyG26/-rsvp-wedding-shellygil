import { useMemo, useState } from 'react';
import { ChevronDown, Loader2, Upload } from 'lucide-react';
import type { GuestRosterEntry } from '../../services/guestRoster';
import { applyOldSiteRsvpImport, previewOldSiteRsvpImport, type OldSiteImportPreview } from '../../services/oldSiteRsvpImport';

interface OldSiteRsvpImportPanelProps {
  entries: GuestRosterEntry[];
  onApplied: () => Promise<void>;
}

// One-off admin utility: matches names from the RSVP export of the site
// that's live today against one side's roster entries here, and offers to
// fill in any that are still "no response yet". Always preview-first - never
// writes until the admin explicitly approves what's about to change.
export function OldSiteRsvpImportPanel({ entries, onApplied }: OldSiteRsvpImportPanelProps) {
  const sides = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.side).filter(Boolean))).sort(),
    [entries],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [side, setSide] = useState(() => (sides.includes('גיל') ? 'גיל' : sides[0] ?? ''));
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<OldSiteImportPreview | null>(null);
  const [error, setError] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [appliedMessage, setAppliedMessage] = useState('');

  const handlePreview = async () => {
    setIsLoading(true);
    setError('');
    setPreview(null);
    setAppliedMessage('');
    try {
      const result = await previewOldSiteRsvpImport(entries, side);
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הגיליון.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview || preview.toUpdate.length === 0) return;
    setIsApplying(true);
    setError('');
    try {
      await applyOldSiteRsvpImport(preview.toUpdate);
      setAppliedMessage(`עודכנו ${preview.toUpdate.length} רשומות בהצלחה.`);
      setPreview(null);
      await onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בעדכון.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="rounded-3xl border border-white/30 bg-white/90 shadow-xl backdrop-blur-md">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between px-5 py-4 text-start"
      >
        <div>
          <p className="font-semibold text-gray-900">ייבוא תשובות מהאתר הקודם</p>
          <p className="text-xs text-gray-500">התאמת שמות מהגיליון הישן והשלמת תשובות חסרות בלבד</p>
        </div>
        <ChevronDown size={18} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="space-y-4 border-t border-gray-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-gray-600">צד:</label>
            <select
              value={side}
              onChange={(event) => setSide(event.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
            >
              {sides.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handlePreview}
              disabled={isLoading || !side}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {isLoading ? 'טוען...' : 'הצג תצוגה מקדימה'}
            </button>
          </div>

          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          {appliedMessage && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{appliedMessage}</div>}

          {preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
                <StatBox label="שורות בגיליון" value={preview.totalParsed} />
                <StatBox label="יעודכנו" value={preview.toUpdate.length} tone="emerald" />
                <StatBox label="כבר היה מענה" value={preview.alreadyAnsweredCount} />
                <StatBox label="שייכים לצד אחר" value={preview.otherSide.length} />
                <StatBox label="מעורפל" value={preview.ambiguous.length} tone="amber" />
                <StatBox label="לא נמצא" value={preview.unmatched.length} tone="rose" />
              </div>

              {preview.toUpdate.length > 0 && (
                <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-start">שם באתר הישן</th>
                        <th className="px-3 py-2 text-start">התאמה ברשימה</th>
                        <th className="px-3 py-2 text-start">תשובה</th>
                        <th className="px-3 py-2 text-start">כמות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.toUpdate.map((item, index) => (
                        <tr key={`${item.entry.id}-${index}`} className="border-t border-gray-100">
                          <td className="px-3 py-1.5 text-gray-700">{item.oldSiteName}</td>
                          <td className="px-3 py-1.5 text-gray-900">{item.entry.firstName} {item.entry.lastName}</td>
                          <td className={`px-3 py-1.5 font-medium ${item.status === 'yes' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {item.status === 'yes' ? 'מגיע/ה' : 'לא מגיע/ה'}
                          </td>
                          <td className="px-3 py-1.5 text-gray-700">{item.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.otherSide.length > 0 && (
                <details className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  <summary className="cursor-pointer font-medium">{preview.otherSide.length} שייכים לצד אחר (פירוט)</summary>
                  <ul className="mt-2 space-y-1">
                    {preview.otherSide.map((item, index) => (
                      <li key={index}>&quot;{item.fullName}&quot; ← {item.matches.map((m) => `${m.firstName} ${m.lastName} (${m.side})`).join(', ')}</li>
                    ))}
                  </ul>
                </details>
              )}

              {preview.ambiguous.length > 0 && (
                <details className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <summary className="cursor-pointer font-medium">{preview.ambiguous.length} שמות מעורפלים (לבדיקה ידנית)</summary>
                  <ul className="mt-2 space-y-1">
                    {preview.ambiguous.map((item, index) => (
                      <li key={index}>&quot;{item.fullName}&quot; תואם: {item.matches.map((m) => `${m.firstName} ${m.lastName}`).join(', ')}</li>
                    ))}
                  </ul>
                </details>
              )}

              {preview.unmatched.length > 0 && (
                <details className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  <summary className="cursor-pointer font-medium">{preview.unmatched.length} שמות לא נמצאו ברשימת צד {side}</summary>
                  <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {preview.unmatched.map((name, index) => <li key={index}>{name}</li>)}
                  </ul>
                </details>
              )}

              {preview.toUpdate.length > 0 && (
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={isApplying}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  {isApplying ? <Loader2 size={16} className="animate-spin" /> : null}
                  {isApplying ? 'מעדכן...' : `אשר ועדכן ${preview.toUpdate.length} רשומות`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'amber' | 'rose' }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : tone === 'rose' ? 'text-rose-600' : 'text-gray-700';
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-2 text-center">
      <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}
