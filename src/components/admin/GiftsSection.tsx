import { useMemo, useState } from 'react';
import { Banknote, Check, Download, Loader2, Search, Trash2, Wallet } from 'lucide-react';
import {
  addToTotals,
  CURRENCY_SYMBOLS,
  EMPTY_GIFT_AMOUNTS,
  formatCurrencyAmount,
  getCurrencyTotalsEntries,
  GIFT_CURRENCIES,
  GIFT_METHODS,
  isEmptyGiftAmounts,
  mergeCurrencyTotals,
  sumGiftAmountsByCurrency,
  type GiftAmounts,
  type GiftCurrency,
  type GiftCurrencyTotals,
  type GiftMethod,
} from '../../utils/gifts';

export interface GiftRecordInput {
  id: string;
  fullName: string;
  side: string;
  category: string;
  guestsCount: number;
  giftAmounts: GiftAmounts;
  // 'yes'/'no' mirror the guest's actual RSVP response; null means they
  // haven't responded yet. Shown as a badge next to the name so it's clear
  // at a glance - this tab lists every guest, not just confirmed attendees,
  // since some guests send a gift despite not attending (or before
  // responding at all).
  attendanceStatus: 'yes' | 'no' | null;
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
  currencyLabel: string;
  filterAll: string;
  filterMissing: string;
  filterHasAmount: string;
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
  recordsWord: string;
  emptyState: string;
  loading: string;
  exportButton: string;
  exportingButton: string;
  attendanceAttending: string;
  attendanceNotAttending: string;
  attendancePending: string;
  attendanceFilterAll: string;
  byAttendanceHeading: string;
  notAttendingPaidLabel: string;
}

interface GiftsSectionProps {
  records: GiftRecordInput[];
  labels: GiftsSectionLabels;
  isLoading: boolean;
  isExporting: boolean;
  onUpdateGift: (recordId: string, giftAmounts: GiftAmounts) => Promise<void>;
  onExport: () => void;
}

const METHOD_ICONS: Record<GiftMethod, typeof Banknote> = {
  cash: Banknote,
  bit_paybox: Wallet,
  check: Check,
};

// Each currency gets its own subtle color so that when a guest (or a
// breakdown total) has amounts in more than one currency, they read as
// distinct labeled chips rather than one string glued together with a "+".
const CURRENCY_CHIP_STYLES: Record<GiftCurrency, string> = {
  ILS: 'bg-gray-100 text-gray-700 dark:bg-slate-700/70 dark:text-slate-200',
  USD: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  EUR: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
};

// Renders a per-currency breakdown as a stack of small colored pills (one
// per currency actually present) instead of a single joined "₪1,500 + €700"
// string - each currency is visually distinct and the amounts don't run
// into each other.
function CurrencyAmounts({
  totals,
  size = 'sm',
  direction = 'column',
}: {
  totals: GiftCurrencyTotals;
  size?: 'sm' | 'lg';
  direction?: 'column' | 'row';
}) {
  const entries = getCurrencyTotalsEntries(totals);
  const sizeClass = size === 'lg' ? 'px-3 py-1 text-xl' : 'px-2 py-0.5 text-sm';
  const wrapperClass = direction === 'row' ? 'flex flex-wrap items-center gap-1.5' : 'flex flex-col items-end gap-1';

  if (entries.length === 0) {
    return (
      <span dir="ltr" className={`inline-flex w-fit shrink-0 items-center rounded-lg font-semibold ${sizeClass} ${CURRENCY_CHIP_STYLES.ILS}`}>
        {CURRENCY_SYMBOLS.ILS}0
      </span>
    );
  }

  return (
    <div className={wrapperClass}>
      {entries.map(({ currency, amount }) => (
        <span
          key={currency}
          dir="ltr"
          className={`inline-flex w-fit shrink-0 items-center rounded-lg font-semibold ${sizeClass} ${CURRENCY_CHIP_STYLES[currency]}`}
        >
          {CURRENCY_SYMBOLS[currency]}{formatCurrencyAmount(amount)}
        </span>
      ))}
    </div>
  );
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

// A label/amount row that reads correctly in RTL: the label flows with the
// surrounding (RTL) text naturally, and only the actual number is forced
// dir="ltr" so digits don't get visually reordered - putting dir="ltr" on
// the whole row (an earlier version) is what made "מזומן: ₪0" render
// backwards. Rendered as its own bordered tile (rather than a bare text
// line) so multiple rows in the same breakdown card read as clearly
// separated items instead of blurring together.
function AmountRow({ label, totals, icon: Icon }: { label: string; totals: GiftCurrencyTotals; icon?: typeof Banknote }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
      <span className="flex min-w-0 items-center gap-1.5 truncate text-gray-700 dark:text-slate-300">
        {Icon && <Icon size={14} className="shrink-0 text-gray-400 dark:text-slate-500" />}
        <span className="truncate">{label}</span>
      </span>
      <CurrencyAmounts totals={totals} />
    </div>
  );
}

type MethodInputs = Record<GiftMethod, { text: string; currency: GiftCurrency }>;

function amountsToInputs(amounts: GiftAmounts): MethodInputs {
  return GIFT_METHODS.reduce((accumulated, method) => {
    const entry = amounts[method];
    accumulated[method] = {
      text: entry.amount === null ? '' : formatAmountInput(String(entry.amount)),
      currency: entry.currency,
    };
    return accumulated;
  }, {} as MethodInputs);
}

function inputsToAmounts(inputs: MethodInputs): GiftAmounts {
  return GIFT_METHODS.reduce((accumulated, method) => {
    accumulated[method] = { amount: parseAmountInput(inputs[method].text), currency: inputs[method].currency };
    return accumulated;
  }, {} as GiftAmounts);
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
  const [inputs, setInputs] = useState<MethodInputs>(() => amountsToInputs(record.giftAmounts));
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  const parsedAmounts = inputsToAmounts(inputs);
  const hasChanged = GIFT_METHODS.some((method) => {
    const parsed = parsedAmounts[method];
    const original = record.giftAmounts[method];
    return parsed.amount !== original.amount || (parsed.amount !== null && parsed.currency !== original.currency);
  });
  const rowTotals = sumGiftAmountsByCurrency(parsedAmounts);
  const hasRowTotal = Object.keys(rowTotals).length > 0;

  const handleSave = async (nextAmounts: GiftAmounts) => {
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
    setInputs(amountsToInputs(EMPTY_GIFT_AMOUNTS));
    void handleSave(EMPTY_GIFT_AMOUNTS);
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate font-medium text-gray-900 dark:text-slate-100">{record.fullName}</p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              record.attendanceStatus === 'yes'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : record.attendanceStatus === 'no'
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {record.attendanceStatus === 'yes' ? labels.attendanceAttending : record.attendanceStatus === 'no' ? labels.attendanceNotAttending : labels.attendancePending}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-slate-400">
          {record.side}{record.side && record.category ? ' · ' : ''}{record.category} · {record.guestsCount} {labels.guestsWord}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {GIFT_METHODS.map((method) => {
          const Icon = METHOD_ICONS[method];
          const methodLabel = method === 'cash' ? labels.methodCash : method === 'bit_paybox' ? labels.methodBitPaybox : labels.methodCheck;
          return (
            // The method name used to only exist as a placeholder (which
            // disappears the moment you type) and an invisible sr-only label
            // - so once a number was entered, or on a first glance before
            // typing, there was nothing on screen to tell cash apart from
            // Bit/Paybox apart from check. The label is now always visible
            // as its own small caption above the field, not just implied by
            // an icon. A currency selector sits beside the amount so any of
            // the three methods can be entered in ₪, $ or €.
            <label key={method} className="flex flex-col items-stretch gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800">
              <span className="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-slate-400">
                <Icon size={11} className="shrink-0" />
                <span className="truncate">{methodLabel}</span>
              </span>
              <span className="flex items-center gap-1">
                <select
                  aria-label={labels.currencyLabel}
                  value={inputs[method].currency}
                  onChange={(event) => setInputs((previous) => ({
                    ...previous,
                    [method]: { ...previous[method], currency: event.target.value as GiftCurrency },
                  }))}
                  disabled={isSaving}
                  className="shrink-0 rounded-md border-0 bg-transparent p-0 text-xs font-semibold text-gray-500 outline-none disabled:cursor-not-allowed dark:text-slate-400"
                >
                  {GIFT_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>{CURRENCY_SYMBOLS[currency]}</option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={inputs[method].text}
                  onChange={(event) => setInputs((previous) => ({
                    ...previous,
                    [method]: { ...previous[method], text: formatAmountInput(event.target.value) },
                  }))}
                  placeholder="0"
                  disabled={isSaving}
                  className="w-16 border-0 bg-transparent p-0 text-center text-sm text-gray-900 outline-none disabled:cursor-not-allowed dark:text-slate-100"
                />
              </span>
            </label>
          );
        })}

        {hasRowTotal && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-gray-400 dark:text-slate-500">=</span>
            <CurrencyAmounts totals={rowTotals} direction="row" />
          </div>
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

        {!isEmptyGiftAmounts(record.giftAmounts) && (
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
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'yes' | 'no' | 'pending'>('all');
  const [filterMode, setFilterMode] = useState<'all' | 'missing' | 'has'>('all');
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
    const byMethod: Record<GiftMethod, GiftCurrencyTotals> = { cash: {}, bit_paybox: {}, check: {} };
    const bySide = new Map<string, GiftCurrencyTotals>();
    const byCategory = new Map<string, GiftCurrencyTotals>();
    // Keyed by the same 'yes'/'no'/'pending' values used for the filter, so
    // a gift given by someone who isn't actually attending (or hasn't
    // responded yet) is visible as its own line instead of being silently
    // folded into the same total as confirmed guests.
    const byAttendance: Record<'yes' | 'no' | 'pending', GiftCurrencyTotals> = { yes: {}, no: {}, pending: {} };
    // Actual guest counts (sum of guestsCount, not a count of roster rows) -
    // computed across every invited guest regardless of whether they gave a
    // gift, so each attendance bucket can be reported by real headcount, not
    // just by however many rows happen to fall in it.
    const byAttendanceGuestsCount: Record<'yes' | 'no' | 'pending', number> = { yes: 0, no: 0, pending: 0 };
    // A plain count (not a ratio) of records that said they're NOT attending
    // but still gave a gift - Gil specifically wants this as "how many, and
    // how much", not "X out of Y". The corresponding money total is just
    // summary.byAttendance.no, which (see below) already only ever includes
    // records that have an amount.
    let notAttendingPaidCount = 0;
    let totalByCurrency: GiftCurrencyTotals = {};
    let missingCount = 0;
    // Real headcount behind missingCount (which is a row/record count) - one
    // row can be a couple or family, so "12 records" without this would
    // understate how many actual people that represents.
    let missingGuestsCount = 0;

    records.forEach((record) => {
      const attendanceKey = record.attendanceStatus === 'yes' ? 'yes' : record.attendanceStatus === 'no' ? 'no' : 'pending';
      byAttendanceGuestsCount[attendanceKey] += record.guestsCount;
      const hasAmount = !isEmptyGiftAmounts(record.giftAmounts);

      if (attendanceKey === 'no' && hasAmount) {
        notAttendingPaidCount += 1;
      }

      if (!hasAmount) {
        // Scoped to attending guests only - counting every invited guest
        // with no amount (including everyone who hasn't even responded to
        // the RSVP yet, or declined) is what produced a confusing number
        // like 547 when Gil was expecting something close to his ~240
        // attending records. Of course a non-responder or a declined guest
        // has no amount recorded - that's not a meaningful "still missing"
        // case the way an attending guest with no amount is.
        if (attendanceKey === 'yes') {
          missingCount += 1;
          missingGuestsCount += record.guestsCount;
        }
        return;
      }
      const recordTotals = sumGiftAmountsByCurrency(record.giftAmounts);
      totalByCurrency = mergeCurrencyTotals(totalByCurrency, recordTotals);
      GIFT_METHODS.forEach((method) => {
        const entry = record.giftAmounts[method];
        if (entry.amount !== null) {
          byMethod[method] = addToTotals(byMethod[method], entry.currency, entry.amount);
        }
      });
      const sideKey = record.side || '-';
      const categoryKey = record.category || '-';
      bySide.set(sideKey, mergeCurrencyTotals(bySide.get(sideKey) ?? {}, recordTotals));
      byCategory.set(categoryKey, mergeCurrencyTotals(byCategory.get(categoryKey) ?? {}, recordTotals));
      byAttendance[attendanceKey] = mergeCurrencyTotals(byAttendance[attendanceKey], recordTotals);
    });

    return {
      totalByCurrency,
      byMethod,
      byAttendance,
      byAttendanceGuestsCount,
      notAttendingPaidCount,
      missingGuestsCount,
      missingCount,
      bySideEntries: Array.from(bySide.entries()).sort((first, second) => first[0].localeCompare(second[0])),
      byCategoryEntries: Array.from(byCategory.entries()).sort((first, second) => first[0].localeCompare(second[0])),
    };
  }, [records]);

  const visibleRecords = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return records
      .filter((record) => {
        if (filterMode === 'missing') return isEmptyGiftAmounts(record.giftAmounts);
        if (filterMode === 'has') return !isEmptyGiftAmounts(record.giftAmounts);
        return true;
      })
      .filter((record) => (sideFilter === 'all' ? true : record.side === sideFilter))
      .filter((record) => (categoryFilter === 'all' ? true : record.category === categoryFilter))
      .filter((record) => {
        if (attendanceFilter === 'all') return true;
        if (attendanceFilter === 'pending') return record.attendanceStatus === null;
        return record.attendanceStatus === attendanceFilter;
      })
      .filter((record) => (normalizedSearch ? record.fullName.toLowerCase().includes(normalizedSearch) : true))
      .sort((first, second) => first.fullName.localeCompare(second.fullName, 'he'));
  }, [records, filterMode, sideFilter, categoryFilter, attendanceFilter, searchTerm]);

  // Actual guest count among the currently-visible (filtered) rows - shown
  // alongside the row count so "12 records shown" doesn't get misread as "12
  // guests" when those 12 rows might represent, say, 30 actual people once
  // families/couples are counted.
  const visibleGuestsCount = useMemo(
    () => visibleRecords.reduce((sum, record) => sum + record.guestsCount, 0),
    [visibleRecords],
  );

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* Total + missing count share one card (missing shown as a small
            secondary stat under the total) instead of the missing count
            getting an entire card of its own for a single number. */}
        <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
          <div className="mb-3 flex items-center gap-2 text-gray-500 dark:text-slate-400">
            <Banknote size={16} />
            <span className="text-sm font-medium">{labels.totalLabel}</span>
          </div>
          <CurrencyAmounts totals={summary.totalByCurrency} size="lg" direction="row" />
          {/* A plain count + amount, not a ratio - how many guests who said
              they're NOT attending still gave something, and how much. */}
          <div className="mt-4 border-t border-gray-100 pt-3 dark:border-slate-700">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-600 dark:text-slate-300">{labels.notAttendingPaidLabel}</span>
              <span dir="ltr" className="text-lg font-semibold text-gray-900 dark:text-slate-100">{summary.notAttendingPaidCount}</span>
            </div>
            <CurrencyAmounts totals={summary.byAttendance.no} direction="row" />
          </div>
          {/* Record count alone understates this - one row can be a couple
              or family, so the actual guest count is shown alongside it,
              same "X records · Y guests" pairing used at the bottom of the
              guest list below. */}
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-sm dark:border-slate-700">
            <span className="font-medium text-rose-600 dark:text-rose-400">{labels.missingLabel}</span>
            <span dir="ltr" className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              {summary.missingCount} {labels.recordsWord} · {summary.missingGuestsCount} {labels.guestsWord}
            </span>
          </div>
        </article>

        <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
          <div className="mb-2 flex items-center gap-2 text-gray-500 dark:text-slate-400">
            <Wallet size={16} />
            <span className="text-sm font-medium">{labels.methodCash} / {labels.methodBitPaybox} / {labels.methodCheck}</span>
          </div>
          <div className="space-y-1.5 text-sm">
            <AmountRow label={labels.methodCash} totals={summary.byMethod.cash} icon={METHOD_ICONS.cash} />
            <AmountRow label={labels.methodBitPaybox} totals={summary.byMethod.bit_paybox} icon={METHOD_ICONS.bit_paybox} />
            <AmountRow label={labels.methodCheck} totals={summary.byMethod.check} icon={METHOD_ICONS.check} />
          </div>
        </article>

        {/* Side and attendance-status breakdowns are both short 2-3 line
            lists, so they now share one card (separated by a divider)
            instead of each taking a full card - this is also what makes it
            clear that gifts from non-attending/undecided guests aren't
            silently folded into the same total as confirmed guests (see
            giftRecords in AdminDashboard.tsx). */}
        <article className="rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
          <div className="mb-2 flex items-center gap-2 text-gray-500 dark:text-slate-400">
            <span className="text-sm font-medium">{labels.bySideHeading}</span>
          </div>
          {summary.bySideEntries.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">{labels.breakdownEmpty}</p>
          ) : (
            <div className="space-y-1.5 text-sm">
              {summary.bySideEntries.map(([side, totals]) => (
                <AmountRow key={side} label={side} totals={totals} />
              ))}
            </div>
          )}

          <div className="mb-2 mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 text-gray-500 dark:border-slate-700 dark:text-slate-400">
            <span className="text-sm font-medium">{labels.byAttendanceHeading}</span>
          </div>
          {/* Each row's label includes the actual guest count (not just a
              money total derived from however many rows happen to fall in
              that bucket) - so "attending" reads as e.g. "Attending · 42
              guests", not just a currency figure with no sense of how many
              people that represents. */}
          <div className="space-y-1.5 text-sm">
            <AmountRow label={`${labels.attendanceAttending} · ${summary.byAttendanceGuestsCount.yes} ${labels.guestsWord}`} totals={summary.byAttendance.yes} />
            <AmountRow label={`${labels.attendanceNotAttending} · ${summary.byAttendanceGuestsCount.no} ${labels.guestsWord}`} totals={summary.byAttendance.no} />
            <AmountRow label={`${labels.attendancePending} · ${summary.byAttendanceGuestsCount.pending} ${labels.guestsWord}`} totals={summary.byAttendance.pending} />
          </div>
        </article>
      </div>

      {/* By-category breakdown gets its own full-width section rather than a
          cramped grid card - unlike side (usually just 2 values), the number
          of categories can be large enough that a small card can't fit them
          all legibly. Each category is its own bordered tile (via AmountRow)
          so it's clear at a glance where one group ends and the next
          begins. */}
      <div className="mb-6 rounded-3xl border border-white/30 bg-white/90 p-5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
        <div className="mb-3 flex items-center gap-2 text-gray-500 dark:text-slate-400">
          <span className="text-sm font-medium">{labels.byCategoryHeading}</span>
        </div>
        {summary.byCategoryEntries.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">{labels.breakdownEmpty}</p>
        ) : (
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {summary.byCategoryEntries.map(([category, totals]) => (
              <AmountRow key={category} label={category} totals={totals} />
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
              onClick={() => setFilterMode('all')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filterMode === 'all' ? 'bg-gray-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
            >
              {labels.filterAll}
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('has')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filterMode === 'has' ? 'bg-gray-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
            >
              {labels.filterHasAmount}
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('missing')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filterMode === 'missing' ? 'bg-gray-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
            >
              {labels.filterMissing}
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

            <select
              value={attendanceFilter}
              onChange={(event) => setAttendanceFilter(event.target.value as typeof attendanceFilter)}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-gray-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              <option value="all">{labels.attendanceFilterAll}</option>
              <option value="yes">{labels.attendanceAttending}</option>
              <option value="no">{labels.attendanceNotAttending}</option>
              <option value="pending">{labels.attendancePending}</option>
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

          <p className="text-xs text-gray-500 dark:text-slate-400">
            {visibleRecords.length} {labels.countLabel} · {visibleGuestsCount} {labels.guestsWord}
          </p>
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
