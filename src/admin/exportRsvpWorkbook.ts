import type { Cell, SheetData } from 'write-excel-file/browser';

export interface RSVPExportRecord {
    id: string;
    fullName: string;
    phone: string;
    guestsCount: number;
    isAttending: boolean;
    note: string;
    group: string;
    lang: string;
    createdAt: Date | null;
}

export interface RSVPExportLabels {
    summarySheet: string;
    recordsSheet: string;
    totalSubmissions: string;
    attendingCount: string;
    notAttendingCount: string;
    totalGuestsComing: string;
    plannedGuests: string;
    languageBreakdown: string;
    id: string;
    index: string;
    name: string;
    phone: string;
    guests: string;
    group: string;
    note: string;
    status: string;
    language: string;
    submittedAt: string;
    attending: string;
    notAttending: string;
}

interface ExportRsvpWorkbookOptions {
    records: RSVPExportRecord[];
    plannedGuests: number;
    labels: RSVPExportLabels;
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

export async function exportRsvpWorkbook({ records, plannedGuests, labels, isRtl }: ExportRsvpWorkbookOptions) {
    const attendingRecords = records.filter((record) => record.isAttending);
    const languageCounts = records.reduce<Record<string, number>>((counts, record) => {
        counts[record.lang] = (counts[record.lang] ?? 0) + 1;
        return counts;
    }, {});

    const summaryData: SheetData = [
        [
            { value: labels.summarySheet, type: String, fontWeight: 'bold', fontSize: 18, textColor: '#1F2937' },
            null,
        ],
        [{ value: labels.totalSubmissions, type: String, fontWeight: 'bold' }, records.length],
        [
            { value: labels.attendingCount, type: String, fontWeight: 'bold' },
            attendingRecords.reduce((total, record) => total + record.guestsCount, 0),
        ],
        [
            { value: labels.notAttendingCount, type: String, fontWeight: 'bold' },
            records.reduce((total, record) => total + (!record.isAttending ? record.guestsCount : 0), 0),
        ],
        [
            { value: labels.totalGuestsComing, type: String, fontWeight: 'bold' },
            attendingRecords.reduce((total, record) => total + record.guestsCount, 0),
        ],
        [{ value: labels.plannedGuests, type: String, fontWeight: 'bold' }, plannedGuests],
        [],
        [{ value: labels.languageBreakdown, type: String, fontWeight: 'bold' }, { value: labels.totalSubmissions, type: String, fontWeight: 'bold' }],
        ...Object.entries(languageCounts)
            .sort(([first], [second]) => first.localeCompare(second))
            .map(([language, count]) => [textCell(language.toUpperCase()), count]),
    ];

    const recordsData: SheetData = [
        [labels.index, labels.id, labels.name, labels.phone, labels.guests, labels.group, labels.note, labels.status, labels.language, labels.submittedAt]
            .map((value) => ({ value, type: String, ...headerStyle })),
        ...records.map((record, index) => [
            index + 1,
            textCell(record.id),
            textCell(record.fullName),
            textCell(record.phone),
            record.guestsCount,
            textCell(record.group),
            textCell(record.note),
            textCell(record.isAttending ? labels.attending : labels.notAttending),
            textCell(record.lang.toUpperCase()),
            record.createdAt
                ? { value: record.createdAt, type: Date, format: 'yyyy-mm-dd hh:mm' }
                : null,
        ]),
    ];

    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const date = new Date().toISOString().slice(0, 10);

    await writeXlsxFile([
        {
            data: summaryData,
            sheet: labels.summarySheet,
            columns: [{ width: 30 }, { width: 18 }],
            rightToLeft: isRtl,
            showGridLines: false,
        },
        {
            data: recordsData,
            sheet: labels.recordsSheet,
            columns: [
                { width: 7 },
                { width: 24 },
                { width: 24 },
                { width: 18 },
                { width: 12 },
                { width: 20 },
                { width: 36 },
                { width: 18 },
                { width: 12 },
                { width: 20 },
            ],
            stickyRowsCount: 1,
            rightToLeft: isRtl,
            orientation: 'landscape',
        },
    ]).toFile(`rsvp-data-${date}.xlsx`);
}
