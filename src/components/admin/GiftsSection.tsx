import { useMemo, useState } from 'react';
import { Banknote, Check, Loader2, Search, Wallet } from 'lucide-react';
import { GIFT_METHODS, type GiftMethod } from '../../utils/gifts';

export interface GiftRecordInput {
  id: string;
  fullName: string;
  group: string;
  guestsCount: number;
  giftAmount: number | null;
  giftMethod: GiftMethod | null;
}

interface GiftsSectionLabels {
  title: string;
  subtitle: string;
  totalLabel: string;
  missingLabel: string;
  byGroupHeading: string;
  byGroupEmpty: string;
  methodCash: string;
  methodBitPaybox: string;
  methodCheck: string;
  filterAll: string;
  filterMissing: string;
  groupFilterAll: string;
  searchPlaceholder: string;
  amountPlaceholder: string;
  clearMethodLabel: string;
  saveButton: string;
  savingButton: string;
  saveError: string;
  countLabel: string;
  guestsWord: string;
  emptyState: string;
  loading: string;
}

interface GiftsSectionProps {
  records: GiftRecordInput[];
  groups: string[];
  labels: GiftsSectionLabels;
  isLoading: boolean;
  onUpdateGift: (recordId: string, giftAmount: number | null, giftMethod: GiftMethod | null) => Promise<void>;
}

const METHOD_ICONS: Record<GiftMethod, typeof Banknote> = {
  cash: Banknote,
  bit_paybox: Wallet,
  check: Check,
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(amount);
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
  const [amountInput, setAmountInput] = useState(record.giftAmount === null ? '' : String(record.giftAmount));
  const [methodInput, setMethodInput] = useState<GiftMethod | null>(record.giftMethod);
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  const parsedAmount = amountInput.trim() === '' ? null : Number(amountInput);
  const isAmountValid = parsedAmount === null || (Number.isFinite(parsedAmount) && parsedAmount >= 0);
  const hasChanged = isAmountValid && (parsedAmount !== record.giftAmount || methodInput !== record.giftMethod);

  const handleSave = async () => {
    if (!hasChanged || isSaving || !isAmountValid) return;
    setIsSaving(true);
    setHasError(false);
    try {
      await onUpdateGift(record.id, parsedAmount, methodInput);
    } catch (saveError) {
      console.error('Failed to save gift entry', saveError);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-900 dark:text-slate-100">{record.fullName}</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
          {record.group || '-'} · {record.guestsCount} {labels.guestsWord}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          step="1"
          inputMode="decimal"
          dir="ltr"
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
          placeholder={labels.amountPlaceholder}
          disabled={isSaving}
          className="w-24 rounded-xl border border-gray-300 bg-white px-2 py-1.5 text-center text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-400 dark:focus:ring-slate-700"
        />

        <div className="flex flex-wrap gap-1">
          {GIFT_METHODS.map((method) => {
            const Icon = METHOD_ICONS[method];
            const methodLabel = method === 'cash' ? labels.methodCash : method === 'bit_paybox' ? labels.methodBitPaybox : labels.methodCheck;
            const isActive = methodInput === method;
            return (
              <button
                key={method}
                type="button"
                onClick={() => setMethodInput(isActive ? null : method)}
                disabled={isSaving}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <Icon size={12} />
                {methodLabel}
              </button>
            );
          })}
        </div>

        {(hasChanged || isSaving) && (
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanged || isSaving}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:disabled:bg-slate-700"
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : null}
            {isSaving ? labels.savingButton : labels.saveButton}
          </button>
        )}

        {hasError && <span className="text-xs text-rose-600 dark:text-rose-400">{labels.saveError}</span>}
      </div>
    </div>
  );
}

export function GiftsSection({ records, groups, labels, isLoading, onUpdateGift }: GiftsSectionProps) {
  const [groupFilter, setGroupFilter] = useState<'all' | string>('all');
  const [filterMode, setFilterMode] = useState<'all' | 'missing'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const summary = useMemo(() => {
    const totalAmount = records.reduce((sum, record) => sum + (record.giftAmount ?? 0), 0);
    const byMethod: Record<GiftMethod, number> = { cash: 0, bit_paybox: 0, check: 0 };
    const byGroup = new Map<string, number>();
    let missingCount = 0;

    records.forEach((record) => {
      if (record.giftAmount === null) {
        missingCount += 1;
        return;
      }
      if (record.giftMethod) {
        byMethod[record.giftMethod] += record.giftAmount;
      }
      const groupKey = record.group || '-';
      byGroup.set(groupKey, (byGroup.get(groupKey) ?? 0) + record.giftAmount);
    });

    return {
      totalAmount,
      byMethod,
      byGroupEntries: Array.from(byGroup.entries()).sort((first, second) => second[1] - first[1]),
      missingCount,
    };
  }, [records]);

  const visibleRecords = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return records
      .filter((record) => (filterMode === 'missing' ? record.giftAmount === null : true))
      .filter((record) => (groupFilter === 'all' ? true : record.group === groupFilter))
      .filter((record) => (normalizedSearch ? record.fullName.toLowerCase().includes(normalizedSearch) : true))
      .sort((first, second) => first.fullName.localeCompare(second.fullName));
  }, [records, filterMode, groupFilter, searchTerm]);

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
          <div className="mb-3 flex items-center gap-2 text-gray-500 dark:text-slate-400">
            <Banknote size={16} />
            <span className="text-sm font-medium">{labels.totalLabel}</span>
          </div>
          <p dir="ltr" className="text-3xl font-semibold text-gray-900 dark:text-slate-100">₪{formatCurrency(summary.totalAmount)}</p>
        </article>

        <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
          <div className="mb-3 flex items-center gap-2 text-gray-500 dark:text-slate-400">
            <Wallet size={16} />
            <span className="text-sm font-medium">{labels.methodCash} / Bit·Paybox / {labels.methodCheck}</span>
          </div>
          <div className="space-y-1 text-sm text-gray-700 dark:text-slate-300">
            <p dir="ltr">{labels.methodCash}: ₪{formatCurrency(summary.byMethod.cash)}</p>
            <p dir="ltr">{labels.methodBitPaybox}: ₪{formatCurrency(summary.byMethod.bit_paybox)}</p>
            <p dir="ltr">{labels.methodCheck}: ₪{formatCurrency(summary.byMethod.check)}</p>
          </div>
        </article>

        <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
          <div className="mb-3 flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <span className="text-sm font-medium">{labels.missingLabel}</span>
          </div>
          <p dir="ltr" className="text-3xl font-semibold text-gray-900 dark:text-slate-100">{summary.missingCount}</p>
        </article>

        <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
          <div className="mb-3 flex items-center gap-2 text-gray-500 dark:text-slate-400">
            <span className="text-sm font-medium">{labels.byGroupHeading}</span>
          </div>
          {summary.byGroupEntries.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">{labels.byGroupEmpty}</p>
          ) : (
            <div className="max-h-24 space-y-1 overflow-y-auto text-sm text-gray-700 dark:text-slate-300">
              {summary.byGroupEntries.map(([group, amount]) => (
                <p key={group} className="flex items-center justify-between gap-2">
                  <span className="truncate">{group}</span>
                  <span dir="ltr" className="shrink-0">₪{formatCurrency(amount)}</span>
                </p>
              ))}
            </div>
          )}
        </article>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{labels.title}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{labels.subtitle}</p>
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
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-gray-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              <option value="all">{labels.groupFilterAll}</option>
              {groups.map((group) => (
                <option key={group} value={group}>{group}</option>
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
