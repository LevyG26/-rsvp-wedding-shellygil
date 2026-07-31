import type { Cell, SheetData } from 'write-excel-file/browser';
import {
  addToTotals,
  formatCurrencyTotals,
  GIFT_METHODS,
  isEmptyGiftAmounts,
  mergeCurrencyTotals,
  sumGiftAmountsByCurrency,
  type GiftAmounts,
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
}

interface ExportGiftsWorkbookOptions {
    records: GiftExportRecord[];
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

export async function exportGiftsWorkbook({ records, labels, isRtl }: ExportGiftsWorkbookOptions) {
    let byMethod: Record<GiftMethod, GiftCurrencyTotals> = { cash: {}, bit_paybox: {}, check: {} };
    const bySide = new Map<string, GiftCurrencyTotals>();
    const byCategory = new Map<string, GiftCurrencyTotals>();
    let totalTotals: GiftCurrencyTotals = {};
    let missingCount = 0;

    records.forEach((record) => {
        if (isEmptyGiftAmounts(record.giftAmounts)) {
            missingCount += 1;
            return;
        }
        const recordTotals = sumGiftAmountsByCurrency(record.giftAmounts);
        totalTotals = mergeCurrencyTotals(totalTotals, recordTotals);
        GIFT_METHODS.forEach((method) => {
            const entry = record.giftAmounts[method];
            if (entry.amount !== null) {
                byMethod = { ...byMethod, [method]: addToTotals(byMethod[method], entry.currency, entry.amount) };
            }
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
        [labels.name, labels.side, labels.category, labels.guests, labels.attendance, labels.methodCash, labels.methodBitPaybox, labels.methodCheck, labels.total, labels.status]
            .map((value) => ({ value, type: String, ...headerStyle })),
        ...sortedRecords.map((record) => {
            const recordTotals = sumGiftAmountsByCurrency(record.giftAmounts);
            const recorded = !isEmptyGiftAmounts(record.giftAmounts);
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
                { width: 14 },
            ],
            stickyRowsCount: 1,
            rightToLeft: isRtl,
            orientation: 'landscape',
        },
    ]).toFile(`gifts-${date}.xlsx`);
}
