import { useMemo, useState } from 'react';
import { Banknote, Check, Download, Loader2, Search, Trash2, Wallet } from 'lucide-react';
import { GIFT_METHODS, type GiftMethod } from '../../utils/gifts';

export interface GiftRecordInput {
  id: string;
  fullName: string;
  side: string;
  category: string;
  guestsCount: number;
  giftAmounts: Record<GiftMethod, number | null>;
}

interface GiftsSectionLabels {
  title: string;
  subtitle: string;
  totalLabel: string;
  missingLabel: string;
  bySideHeading: string;
  byCategoryHeading: string;
  breakdownEmpty: string;
  methodCash: string;
  methodBitPaybox: string;
  methodCheck: string;
  filterAll: string;
  filterMissing: string;
  sideFilterAll: string;
  categoryFilterAll: string;
  searchPlaceholder: string;
  amountPlaceholder: string;
  saveButton: string;
  savingButton: string;
  saveError: string;
  clearButton: string;
  clearConfirm: string;
  countLabel: string;
  guestsWord: string;
  emptyState: string;
  loading: string;
  exportButton: string;
  exportingButton: string;
}

interface GiftsSectionProps {
  records: GiftRecordInput[];
  labels: GiftsSectionLabels;
  isLoading: boolean;
  isExporting: boolean;
  onUpdateGift: (recordId: string, giftAmounts: Record<GiftMethod, number | null>) => Promise<void>;
  onExport: () => void;
}

const EMPTY_AMOUNTS: Record<GiftMethod, number | null> = { cash: null, bit_paybox: null, check: null };

const METHOD_ICONS: Record<GiftMethod, typeof Banknote> = {
  cash: Banknote,
  bit_paybox: Wallet,
  check: Check,
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount);
}

// Formats digits-only input with thousands separators as the person types
// (e.g. "1500" -> "1,500"), so entering a gift amount reads clearly without
// needing to count zeros. Parsing just strips the separators back out.
function formatAmountInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('en-US');
}

function parseAmountInput(formatted: string): number | null {
  const digits = formatted.replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

function sumAmounts(amounts: Record<GiftMethod, number | null>): number {
  return (amounts.cash ?? 0) + (amounts.bit_paybox ?? 0) + (amounts.check ?? 0);
}

function isEmptyAmounts(amounts: Record<GiftMethod, number | null>): boolean {
  return amounts.cash === null && amounts.bit_paybox === null && amounts.check === null;
}

// A label/amount row that reads correctly in RTL: the label flows with the
// surrounding (RTL) text naturally, and only the actual number is forced
// dir="ltr" so digits don't get visually reordered - putting dir="ltr" on
// the whole row (an earlier version) is what made "מזומן: ₪0" render
// backwards.
function AmountRow({ label, amount, icon: Icon }: { label: string; amount: number; icon?: typeof Banknote }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="flex min-w-0 items-center gap-1.5 truncate text-gray-700 dark:text-slate-300">
        {Icon && <Icon size={14} className="shrink-0 text-gray-400 dark:text-slate-500" />}
        <span className="truncate">{label}</span>
      </span>
      <span dir="ltr" className="shrink-0 font-semibold text-gray-900 dark:text-slate-100">₪{formatCurrency(amount)}</span>
    </div>
  );
}

function GiftRow({
  record,
  labels,
  onUpdateGift,
}: {
  record: GiftRecordInput;
  labels: GiftsSectionLabels;
  onUpdateGift: GiftsSectionProps['onUpdateGift'];
}) {
  const [inputs, setInputs] = useState<Record<GiftMethod, string>>({
    cash: record.giftAmounts.cash === null ? '' : formatAmountInput(String(record.giftAmounts.cash)),
    bit_paybox: record.giftAmounts.bit_paybox === null ? '' : formatAmountInput(String(record.giftAmounts.bit_paybox)),
    check: record.giftAmounts.check === null ? '' : formatAmountInput(String(record.giftAmounts.check)),
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  const parsedAmounts: Record<GiftMethod, number | null> = {
    cash: parseAmountInput(inputs.cash),
    bit_paybox: parseAmountInput(inputs.bit_paybox),
    check: parseAmountInput(inputs.check),
  };
  const hasChanged = GIFT_METHODS.some((method) => parsedAmounts[method] !== record.giftAmounts[method]);
  const rowTotal = sumAmounts(parsedAmounts);

  const handleSave = async (nextAmounts: Record<GiftMethod, number | null>) => {
    if (isSaving) return;
    setIsSaving(true);
    setHasError(false);
    try {
      await onUpdateGift(record.id, nextAmounts);
    } catch (saveError) {
      console.error('Failed to save gift entry', saveError);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    if (isSaving) return;
    if (!window.confirm(labels.clearConfirm)) return;
    setInputs({ cash: '', bit_paybox: '', check: '' });
    void handleSave(EMPTY_AMOUNTS);
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-900 dark:text-slate-100">{record.fullName}</p>
        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-slate-400">
          {record.side}{record.side && record.category ? ' · ' : ''}{record.category} · {record.guestsCount} {labels.guestsWord}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {GIFT_METHODS.map((method) => {
          const Icon = METHOD_ICONS[method];
          const methodLabel = method === 'cash' ? labels.methodCash : method === 'bit_paybox' ? labels.methodBitPaybox : labels.methodCheck;
          return (
            <label key={method} className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800">
              <Icon size={13} className="shrink-0 text-gray-400 dark:text-slate-500" />
              <span className="sr-only">{methodLabel}</span>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={inputs[method]}
                onChange={(event) => setInputs((previous) => ({ ...previous, [method]: formatAmountInput(event.target.value) }))}
                placeholder={labels.amountPlaceholder}
                disabled={isSaving}
                title={methodLabel}
                className="w-20 bg-transparent text-center text-sm text-gray-900 outline-none disabled:cursor-not-allowed dark:text-slate-100"
              />
            </label>
          );
        })}

        {rowTotal > 0 && (
          <span dir="ltr" className="shrink-0 text-xs font-medium text-gray-500 dark:text-slate-400">= ₪{formatCurrency(rowTotal)}</span>
        )}

        {(hasChanged || isSaving) && (
          <button
            type="button"
            onClick={() => handleSave(parsedAmounts)}
            disabled={!hasChanged || isSaving}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:disabled:bg-slate-700"
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : null}
            {isSaving ? labels.savingButton : labels.saveButton}
          </button>
        )}

        {!isEmptyAmounts(record.giftAmounts) && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isSaving}
            aria-label={labels.clearButton}
            title={labels.clearButton}
            className="shrink-0 rounded-xl p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed dark:text-slate-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
          >
            <Trash2 size={14} />
          </button>
        )}

        {hasError && <span className="text-xs text-rose-600 dark:text-rose-400">{labels.saveError}</span>}
      </div>
    </div>
  );
}

export function GiftsSection({ records, labels, isLoading, isExporting, onUpdateGift, onExport }: GiftsSectionProps) {
  const [sideFilter, setSideFilter] = useState<'all' | string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [filterMode, setFilterMode] = useState<'all' | 'missing'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const sides = useMemo(
    () => Array.from(new Set(records.map((record) => record.side).filter(Boolean))).sort((first, second) => first.localeCompare(second)),
    [records],
  );

  const categories = useMemo(
    () => Array.from(new Set(records.map((record) => record.category).filter(Boolean))).sort((first, second) => first.localeCompare(second)),
    [records],
  );

  const summary = useMemo(() => {
    const byMethod: Record<GiftMethod, number> = { cash: 0, bit_paybox: 0, check: 0 };
    const bySide = new Map<string, number>();
    const byCategory = new Map<string, number>();
    let totalAmount = 0;
    let missingCount = 0;

    records.forEach((record) => {
      if (isEmptyAmounts(record.giftAmounts)) {
        missingCount += 1;
        return;
      }
      const recordTotal = sumAmounts(record.giftAmounts);
      totalAmount += recordTotal;
      GIFT_METHODS.forEach((method) => {
        byMethod[method] += record.giftAmounts[method] ?? 0;
      });
      const sideKey = record.side || '-';
      const categoryKey = record.category || '-';
      bySide.set(sideKey, (bySide.get(sideKey) ?? 0) + recordTotal);
      byCategory.set(categoryKey, (byCategory.get(categoryKey) ?? 0) + recordTotal);
    });

    return {
      totalAmount,
      byMethod,
      missingCount,
      bySideEntries: Array.from(bySide.entries()).sort((first, second) => first[0].localeCompare(second[0])),
      byCategoryEntries: Array.from(byCategory.entries()).sort((first, second) => first[0].localeCompare(second[0])),
    };
  }, [records]);

  const visibleRecords = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return records
      .filter((record) => (filterMode === 'missing' ? isEmptyAmounts(record.giftAmounts) : true))
      .filter((record) => (sideFilter === 'all' ? true : record.side === sideFilter))
      .filter((record) => (categoryFilter === 'all' ? true : record.category === categoryFilter))
      .filter((record) => (normalizedSearch ? record.fullName.toLowerCase().includes(normalizedSearch) : true))
      .sort((first, second) => first.fullName.localeCompare(second.fullName, 'he'));
  }, [records, filterMode, sideFilter, categoryFilter, searchTerm]);

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
          <div className="mb-3 flex items-center gap-2 text-gray-500 dark:text-slate-400">
            <Banknote size={16} />
            <span className="text-sm font-medium">{labels.totalLabel}</span>
          </div>
          <p dir="ltr" className="text-3xl font-semibold text-gray-900 dark:text-slate-100">₪{formatCurrency(summary.totalAmount)}</p>
        </article>

        <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
          <div className="mb-2 flex items-center gap-2 text-gray-500 dark:text-slate-400">
            <Wallet size={16} />
            <span className="text-sm font-medium">{labels.methodCash} / {labels.methodBitPaybox} / {labels.methodCheck}</span>
          </div>
          <div className="text-sm">
            <AmountRow label={labels.methodCash} amount={summary.byMethod.cash} icon={METHOD_ICONS.cash} />
            <AmountRow label={labels.methodBitPaybox} amount={summary.byMethod.bit_paybox} icon={METHOD_ICONS.bit_paybox} />
            <AmountRow label={labels.methodCheck} amount={summary.byMethod.check} icon={METHOD_ICONS.check} />
          </div>
        </article>

        <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
          <div className="mb-3 flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <span className="text-sm font-medium">{labels.missingLabel}</span>
          </div>
          <p dir="ltr" className="text-3xl font-semibold text-gray-900 dark:text-slate-100">{summary.missingCount}</p>
        </article>

        <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
          <div className="mb-2 flex items-center gap-2 text-gray-500 dark:text-slate-400">
            <span className="text-sm font-medium">{labels.bySideHeading}</span>
          </div>
          {summary.bySideEntries.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">{labels.breakdownEmpty}</p>
          ) : (
            <div className="text-sm">
              {summary.bySideEntries.map(([side, amount]) => (
                <AmountRow key={side} label={side} amount={amount} />
              ))}
            </div>
          )}
        </article>
      </div>

      {/* By-category breakdown gets its own full-width section rather than a
          cramped grid card - unlike side (usually just 2 values), the number
          of categories can be large enough that a small card can't fit them
          all legibly. */}
      <div className="mb-6 rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
        <div className="mb-3 flex items-center gap-2 text-gray-500 dark:text-slate-400">
          <span className="text-sm font-medium">{labels.byCategoryHeading}</span>
        </div>
        {summary.byCategoryEntries.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">{labels.breakdownEmpty}</p>
        ) : (
          <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {summary.byCategoryEntries.map(([category, amount]) => (
              <AmountRow key={category} label={category} amount={amount} />
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-slate-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{labels.title}</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{labels.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onExport}
              disabled={isExporting || records.length === 0}
              className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                isExporting || records.length === 0
                  ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-600'
                  : 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
              }`}
            >
              {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {isExporting ? labels.exportingButton : labels.exportButton}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterMode('missing')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filterMode === 'missing' ? 'bg-gray-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
            >
              {labels.filterMissing}
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filterMode === 'all' ? 'bg-gray-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
            >
              {labels.filterAll}
            </button>

            <select
              value={sideFilter}
              onChange={(event) => setSideFilter(event.target.value)}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-gray-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              <option value="all">{labels.sideFilterAll}</option>
              {sides.map((side) => (
                <option key={side} value={side}>{side}</option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-gray-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              <option value="all">{labels.categoryFilterAll}</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>

            <div className="relative ms-auto min-w-[10rem] flex-1 sm:flex-none">
              <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={labels.searchPlaceholder}
                className="w-full rounded-full border border-gray-200 bg-white py-1.5 ps-8 pe-3 text-xs text-gray-700 outline-none focus:border-gray-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              />
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-slate-400">{visibleRecords.length} {labels.countLabel}</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 p-8 text-gray-600 dark:text-slate-400">
            <span className="h-5 w-5 rounded-full border-2 border-gray-200 border-t-gray-700 animate-spin dark:border-slate-700 dark:border-t-slate-300" />
            <span>{labels.loading}</span>
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="p-8 text-center text-gray-600 dark:text-slate-400">{labels.emptyState}</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {visibleRecords.map((record) => (
              <GiftRow key={record.id} record={record} labels={labels} onUpdateGift={onUpdateGift} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
