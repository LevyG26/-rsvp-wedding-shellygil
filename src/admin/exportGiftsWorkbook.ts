import type { Cell, SheetData } from 'write-excel-file/browser';
import {
  addToTotals,
  formatCurrencyTotals,
  GIFT_CURRENCIES,
  GIFT_METHODS,
  mergeCurrencyTotals,
  type GiftAmounts,
  type GiftCurrency,
  type GiftCurrencyTotals,
  type GiftMethod,
} from '../utils/gifts';

export interface GiftExportRecord {
    id: string;
    fullName: string;
    side: string;
    category: string;
    guestsCount: number;
    giftAmounts: GiftAmounts;
    attendanceStatus: 'yes' | 'no' | null;
    // Sum of this record's own giftAmounts plus every gift-tracking
    // household member linked to it (see AdminDashboard.tsx's giftRecords
    // and services/giftHouseholds.ts) - this is what the summary, details,
    // and per-side sheets below all actually total/sort/filter by, so a
    // couple/family linked together reads as one combined figure here too,
    // matching what the dashboard itself shows.
    combinedTotals: GiftCurrencyTotals;
    // Every household member's OWN giftAmounts, primary first - needed so
    // the by-method breakdown below sums cash/Bit-Paybox/check across the
    // whole household, not just the primary (see the byMethod loop's own
    // comment - using giftAmounts alone there silently excluded a linked
    // member's already-recorded amount from this one sheet, even though
    // combinedTotals and everything else were always correct).
    combinedGiftAmounts: GiftAmounts[];
    linkedMemberNames: string[];
}

// Every roster entry with its OWN recorded giftEntries doc, exactly as
// stored, with no household folding/combining at all - see AdminDashboard's
// rawGiftEntryRecords doc comment for why this needs to exist as its own,
// independently-computed sheet rather than trusting the (already
// household-aware) records above.
export interface GiftRawEntryExport {
    id: string;
    fullName: string;
    side: string;
    amounts: GiftAmounts;
    householdMemberNames: string[];
}

export interface GiftExportLabels {
    summarySheet: string;
    detailsSheet: string;
    totalReceived: string;
    missingCount: string;
    byMethodHeading: string;
    methodCash: string;
    methodBitPaybox: string;
    methodCheck: string;
    bySideHeading: string;
    byCategoryHeading: string;
    name: string;
    side: string;
    category: string;
    guests: string;
    total: string;
    status: string;
    statusRecorded: string;
    statusMissing: string;
    attendance: string;
    attendanceAttending: string;
    attendanceNotAttending: string;
    attendancePending: string;
    linkedWith: string;
    // Sheet name prefix for the per-side "top gifts" sheets - kept short,
    // since one side's name gets appended and Excel caps sheet names at 31
    // characters total.
    topGiftsSheetPrefix: string;
    rank: string;
    // Labels for the raw/unfolded diagnostic sheet.
    rawSheet: string;
    rawTotalLabel: string;
    householdWith: string;
}

interface ExportGiftsWorkbookOptions {
    records: GiftExportRecord[];
    rawEntries: GiftRawEntryExport[];
    labels: GiftExportLabels;
    isRtl: boolean;
}

const headerStyle = {
    backgroundColor: '#1F2937',
    textColor: '#FFFFFF',
    fontWeight: 'bold' as const,
    align: 'center' as const,
    alignVertical: 'center' as const,
    height: 28,
};

const textCell = (value: string): Cell => ({ value, type: String, wrap: true, alignVertical: 'top' });

// Per-currency totals can never be safely combined into a single number
// (no live exchange rate), so every amount cell is a formatted text string
// like "₪500 + $200" rather than a plain Number cell.
const amountTextCell = (totals: GiftCurrencyTotals): Cell => ({
    value: formatCurrencyTotals(totals),
    type: String,
    align: 'center',
    alignVertical: 'center',
});

function methodTotals(amounts: GiftAmounts, method: GiftMethod): GiftCurrencyTotals {
    const entry = amounts[method];
    return entry.amount !== null ? { [entry.currency]: entry.amount } : {};
}

export async function exportGiftsWorkbook({ records, rawEntries, labels, isRtl }: ExportGiftsWorkbookOptions) {
    let byMethod: Record<GiftMethod, GiftCurrencyTotals> = { cash: {}, bit_paybox: {}, check: {} };
    const bySide = new Map<string, GiftCurrencyTotals>();
    const byCategory = new Map<string, GiftCurrencyTotals>();
    let totalTotals: GiftCurrencyTotals = {};
    let missingCount = 0;

    records.forEach((record) => {
        // combinedTotals (own amount + any linked household members'), not
        // just this record's own giftAmounts - see the field's doc comment
        // on GiftExportRecord above.
        if (Object.keys(record.combinedTotals).length === 0) {
            // Scoped to attending guests only, same as the dashboard stat -
            // counting every invited guest with no amount (including anyone
            // who hasn't responded yet, or declined) isn't a meaningful
            // "missing" case the way an attending guest with no amount is.
            if (record.attendanceStatus === 'yes') missingCount += 1;
            return;
        }
        const recordTotals = record.combinedTotals;
        totalTotals = mergeCurrencyTotals(totalTotals, recordTotals);
        record.combinedGiftAmounts.forEach((amounts) => {
            GIFT_METHODS.forEach((method) => {
                const entry = amounts[method];
                if (entry.amount !== null) {
                    byMethod = { ...byMethod, [method]: addToTotals(byMethod[method], entry.currency, entry.amount) };
                }
            });
        });
        const sideKey = record.side || '-';
        const categoryKey = record.category || '-';
        bySide.set(sideKey, mergeCurrencyTotals(bySide.get(sideKey) ?? {}, recordTotals));
        byCategory.set(categoryKey, mergeCurrencyTotals(byCategory.get(categoryKey) ?? {}, recordTotals));
    });

    const sortedSides = Array.from(bySide.entries()).sort((first, second) => first[0].localeCompare(second[0]));
    const sortedCategories = Array.from(byCategory.entries()).sort((first, second) => first[0].localeCompare(second[0]));

    const summaryData: SheetData = [
        [{ value: labels.summarySheet, type: String, fontWeight: 'bold', fontSize: 18, textColor: '#1F2937' }, null],
        [{ value: labels.totalReceived, type: String, fontWeight: 'bold' }, amountTextCell(totalTotals)],
        [{ value: labels.missingCount, type: String, fontWeight: 'bold' }, missingCount],
        [],
        [{ value: labels.byMethodHeading, type: String, fontWeight: 'bold', fontSize: 14, textColor: '#1F2937' }, null],
        [textCell(labels.methodCash), amountTextCell(byMethod.cash)],
        [textCell(labels.methodBitPaybox), amountTextCell(byMethod.bit_paybox)],
        [textCell(labels.methodCheck), amountTextCell(byMethod.check)],
        [],
        [{ value: labels.bySideHeading, type: String, fontWeight: 'bold', fontSize: 14, textColor: '#1F2937' }, null],
        ...sortedSides.map(([side, totals]) => [textCell(side), amountTextCell(totals)]),
        [],
        [{ value: labels.byCategoryHeading, type: String, fontWeight: 'bold', fontSize: 14, textColor: '#1F2937' }, null],
        ...sortedCategories.map(([category, totals]) => [textCell(category), amountTextCell(totals)]),
    ];

    const sortedRecords = [...records].sort((first, second) => first.fullName.localeCompare(second.fullName, 'he'));

    const attendanceLabel = (status: 'yes' | 'no' | null) =>
        status === 'yes' ? labels.attendanceAttending : status === 'no' ? labels.attendanceNotAttending : labels.attendancePending;

    const detailsData: SheetData = [
        [labels.name, labels.side, labels.category, labels.guests, labels.attendance, labels.methodCash, labels.methodBitPaybox, labels.methodCheck, labels.total, labels.linkedWith, labels.status]
            .map((value) => ({ value, type: String, ...headerStyle })),
        ...sortedRecords.map((record) => {
            // combinedTotals/recorded reflect this record PLUS any linked
            // gift household members (see GiftExportRecord doc comment) - a
            // couple linked together shows as one "recorded" row with the
            // combined figure, matching the dashboard.
            const recordTotals = record.combinedTotals;
            const recorded = Object.keys(recordTotals).length > 0;
            const cashEntry = record.giftAmounts.cash;
            const bitPayboxEntry = record.giftAmounts.bit_paybox;
            const checkEntry = record.giftAmounts.check;
            return [
                textCell(record.fullName),
                textCell(record.side),
                textCell(record.category),
                record.guestsCount,
                textCell(attendanceLabel(record.attendanceStatus)),
                cashEntry.amount !== null ? amountTextCell(methodTotals(record.giftAmounts, 'cash')) : null,
                bitPayboxEntry.amount !== null ? amountTextCell(methodTotals(record.giftAmounts, 'bit_paybox')) : null,
                checkEntry.amount !== null ? amountTextCell(methodTotals(record.giftAmounts, 'check')) : null,
                amountTextCell(recordTotals),
                textCell(record.linkedMemberNames.length > 0 ? record.linkedMemberNames.join(', ') : '-'),
                {
                    value: recorded ? labels.statusRecorded : labels.statusMissing,
                    type: String,
                    align: 'center' as const,
                    backgroundColor: recorded ? '#D1FAE5' : '#FEE2E2',
                    textColor: recorded ? '#065F46' : '#991B1B',
                },
            ];
        }),
    ];

    // Per-side "top gifts" sheets: within each side, one sorted-descending
    // block per currency (never combined - see GiftCurrencyTotals doc
    // comment), so Gil can see at a glance who gave the most on each side,
    // in each currency, with the top few highlighted. Records with no
    // combinedTotals amount in a given currency simply don't appear in that
    // currency's block. Purely a read/reformat of combinedTotals - no writes
    // anywhere, so this can never affect the underlying recorded amounts.
    const sides = Array.from(new Set(records.map((record) => record.side || '-'))).sort((first, second) =>
        first.localeCompare(second, 'he'),
    );

    const rankHighlight = (rank: number) => {
        if (rank === 1) return { backgroundColor: '#FEF3C7', textColor: '#92400E' };
        if (rank === 2) return { backgroundColor: '#F3F4F6', textColor: '#374151' };
        if (rank === 3) return { backgroundColor: '#FFEDD5', textColor: '#9A3412' };
        return {};
    };

    const topGiftsSheets = sides.map((side) => {
        const sideRecords = records.filter((record) => (record.side || '-') === side);
        const rows: SheetData = [
            [{ value: `${labels.topGiftsSheetPrefix} - ${side}`, type: String, fontWeight: 'bold', fontSize: 16, textColor: '#1F2937' }],
        ];

        GIFT_CURRENCIES.forEach((currency: GiftCurrency) => {
            const withAmount = sideRecords
                .map((record) => ({ record, amount: record.combinedTotals[currency] }))
                .filter((entry): entry is { record: GiftExportRecord; amount: number } => !!entry.amount)
                .sort((first, second) => second.amount - first.amount);

            if (withAmount.length === 0) return;

            rows.push([]);
            rows.push([{ value: currency, type: String, fontWeight: 'bold', fontSize: 13, textColor: '#1F2937' }]);
            rows.push(
                [labels.rank, labels.name, labels.total, labels.linkedWith].map((value) => ({
                    value,
                    type: String,
                    ...headerStyle,
                })),
            );
            withAmount.forEach(({ record, amount }, index) => {
                const rank = index + 1;
                const highlight = rankHighlight(rank);
                rows.push([
                    { value: rank, type: Number, align: 'center' as const, ...highlight },
                    { ...textCell(record.fullName), ...highlight },
                    {
                        value: `${formatCurrencyTotals({ [currency]: amount })}`,
                        type: String,
                        align: 'center' as const,
                        ...highlight,
                    },
                    { ...textCell(record.linkedMemberNames.length > 0 ? record.linkedMemberNames.join(', ') : '-'), ...highlight },
                ]);
            });
        });

        return {
            data: rows,
            // Excel sheet names are capped at 31 characters.
            sheet: `${labels.topGiftsSheetPrefix} - ${side}`.slice(0, 31),
            columns: [{ width: 8 }, { width: 26 }, { width: 16 }, { width: 26 }],
            rightToLeft: isRtl,
            showGridLines: false,
        };
    });

    // Raw/unfolded diagnostic sheet - totals computed directly from
    // rawEntries, completely bypassing combinedTotals/combinedGiftAmounts
    // above, so this can be compared against the summary sheet's by-method
    // figures as an independent check.
    let rawByMethod: Record<GiftMethod, GiftCurrencyTotals> = { cash: {}, bit_paybox: {}, check: {} };
    rawEntries.forEach((entry) => {
        GIFT_METHODS.forEach((method) => {
            const methodEntry = entry.amounts[method];
            if (methodEntry.amount !== null) {
                rawByMethod[method] = addToTotals(rawByMethod[method], methodEntry.currency, methodEntry.amount);
            }
        });
    });
    const sortedRawEntries = [...rawEntries].sort((first, second) => first.fullName.localeCompare(second.fullName, 'he'));
    const rawData: SheetData = [
        [{ value: labels.rawSheet, type: String, fontWeight: 'bold', fontSize: 16, textColor: '#1F2937' }],
        [textCell(`${labels.rawTotalLabel} - ${labels.methodCash}`), amountTextCell(rawByMethod.cash)],
        [textCell(`${labels.rawTotalLabel} - ${labels.methodBitPaybox}`), amountTextCell(rawByMethod.bit_paybox)],
        [textCell(`${labels.rawTotalLabel} - ${labels.methodCheck}`), amountTextCell(rawByMethod.check)],
        [],
        [labels.name, labels.side, labels.methodCash, labels.methodBitPaybox, labels.methodCheck, labels.householdWith].map(
            (value) => ({ value, type: String, ...headerStyle }),
        ),
        ...sortedRawEntries.map((entry) => {
            const cashEntry = entry.amounts.cash;
            const bitPayboxEntry = entry.amounts.bit_paybox;
            const checkEntry = entry.amounts.check;
            return [
                textCell(entry.fullName),
                textCell(entry.side),
                cashEntry.amount !== null ? amountTextCell(methodTotals(entry.amounts, 'cash')) : null,
                bitPayboxEntry.amount !== null ? amountTextCell(methodTotals(entry.amounts, 'bit_paybox')) : null,
                checkEntry.amount !== null ? amountTextCell(methodTotals(entry.amounts, 'check')) : null,
                textCell(entry.householdMemberNames.length > 0 ? entry.householdMemberNames.join(', ') : '-'),
            ];
        }),
    ];

    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const date = new Date().toISOString().slice(0, 10);

    await writeXlsxFile([
        {
            data: summaryData,
            sheet: labels.summarySheet,
            columns: [{ width: 26 }, { width: 20 }],
            rightToLeft: isRtl,
            showGridLines: false,
        },
        {
            data: detailsData,
            sheet: labels.detailsSheet,
            columns: [
                { width: 26 },
                { width: 16 },
                { width: 18 },
                { width: 10 },
                { width: 14 },
                { width: 14 },
                { width: 16 },
                { width: 12 },
                { width: 16 },
                { width: 26 },
                { width: 14 },
            ],
            stickyRowsCount: 1,
            rightToLeft: isRtl,
            orientation: 'landscape',
        },
        ...topGiftsSheets,
        {
            data: rawData,
            sheet: labels.rawSheet.slice(0, 31),
            columns: [{ width: 26 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 12 }, { width: 26 }],
            rightToLeft: isRtl,
            showGridLines: false,
        },
    ]).toFile(`gifts-${date}.xlsx`);
}
