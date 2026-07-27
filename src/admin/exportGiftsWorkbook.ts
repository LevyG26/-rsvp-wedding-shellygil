import type { Cell, SheetData } from 'write-excel-file/browser';
import type { GiftMethod } from '../utils/gifts';

export interface GiftExportRecord {
    id: string;
    fullName: string;
    side: string;
    category: string;
    guestsCount: number;
    giftAmounts: Record<GiftMethod, number | null>;
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

const moneyCell = (value: number): Cell => ({ value, type: Number, format: '#,##0', align: 'center' });

function sumAmounts(amounts: Record<GiftMethod, number | null>): number {
    return (amounts.cash ?? 0) + (amounts.bit_paybox ?? 0) + (amounts.check ?? 0);
}

function isEmptyAmounts(amounts: Record<GiftMethod, number | null>): boolean {
    return amounts.cash === null && amounts.bit_paybox === null && amounts.check === null;
}

export async function exportGiftsWorkbook({ records, labels, isRtl }: ExportGiftsWorkbookOptions) {
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
        byMethod.cash += record.giftAmounts.cash ?? 0;
        byMethod.bit_paybox += record.giftAmounts.bit_paybox ?? 0;
        byMethod.check += record.giftAmounts.check ?? 0;
        const sideKey = record.side || '-';
        const categoryKey = record.category || '-';
        bySide.set(sideKey, (bySide.get(sideKey) ?? 0) + recordTotal);
        byCategory.set(categoryKey, (byCategory.get(categoryKey) ?? 0) + recordTotal);
    });

    const sortedSides = Array.from(bySide.entries()).sort((first, second) => first[0].localeCompare(second[0]));
    const sortedCategories = Array.from(byCategory.entries()).sort((first, second) => first[0].localeCompare(second[0]));

    const summaryData: SheetData = [
        [{ value: labels.summarySheet, type: String, fontWeight: 'bold', fontSize: 18, textColor: '#1F2937' }, null],
        [{ value: labels.totalReceived, type: String, fontWeight: 'bold' }, moneyCell(totalAmount)],
        [{ value: labels.missingCount, type: String, fontWeight: 'bold' }, missingCount],
        [],
        [{ value: labels.byMethodHeading, type: String, fontWeight: 'bold', fontSize: 14, textColor: '#1F2937' }, null],
        [textCell(labels.methodCash), moneyCell(byMethod.cash)],
        [textCell(labels.methodBitPaybox), moneyCell(byMethod.bit_paybox)],
        [textCell(labels.methodCheck), moneyCell(byMethod.check)],
        [],
        [{ value: labels.bySideHeading, type: String, fontWeight: 'bold', fontSize: 14, textColor: '#1F2937' }, null],
        ...sortedSides.map(([side, amount]) => [textCell(side), moneyCell(amount)]),
        [],
        [{ value: labels.byCategoryHeading, type: String, fontWeight: 'bold', fontSize: 14, textColor: '#1F2937' }, null],
        ...sortedCategories.map(([category, amount]) => [textCell(category), moneyCell(amount)]),
    ];

    const sortedRecords = [...records].sort((first, second) => first.fullName.localeCompare(second.fullName, 'he'));

    const detailsData: SheetData = [
        [labels.name, labels.side, labels.category, labels.guests, labels.methodCash, labels.methodBitPaybox, labels.methodCheck, labels.total, labels.status]
            .map((value) => ({ value, type: String, ...headerStyle })),
        ...sortedRecords.map((record) => {
            const recordTotal = sumAmounts(record.giftAmounts);
            const recorded = !isEmptyAmounts(record.giftAmounts);
            return [
                textCell(record.fullName),
                textCell(record.side),
                textCell(record.category),
                record.guestsCount,
                record.giftAmounts.cash !== null ? moneyCell(record.giftAmounts.cash) : null,
                record.giftAmounts.bit_paybox !== null ? moneyCell(record.giftAmounts.bit_paybox) : null,
                record.giftAmounts.check !== null ? moneyCell(record.giftAmounts.check) : null,
                moneyCell(recordTotal),
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
            columns: [{ width: 26 }, { width: 16 }],
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
                { width: 12 },
                { width: 14 },
                { width: 10 },
                { width: 12 },
                { width: 14 },
            ],
            stickyRowsCount: 1,
            rightToLeft: isRtl,
            orientation: 'landscape',
        },
    ]).toFile(`gifts-${date}.xlsx`);
}
