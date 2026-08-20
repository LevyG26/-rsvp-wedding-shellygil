import type { Cell, SheetData } from 'write-excel-file/browser';

export interface SeatingExportGuest {
    name: string;
    category: string;
    seats: number;
}

export interface SeatingExportTable {
    name: string;
    // Pre-formatted, already-translated occupancy line, e.g.
    // "6 out of 8 seats filled" - built by the caller (which has the
    // translated template string) rather than assembled here.
    occupiedText: string;
    isFull: boolean;
    guests: SeatingExportGuest[];
}

export interface SeatingExportUnseatedGuest {
    name: string;
    category: string;
    remaining: number;
}

// One row per confirmed guest, regardless of seating status - mirrors the
// in-app sortable list view (SeatingSection.tsx's guestListRows) so the
// Excel export and the on-screen list always show the same information.
export interface SeatingExportListRow {
    name: string;
    side: string;
    category: string;
    invitedCount: number;
    // Already-translated status text (e.g. "Seated" / "Partially seated" /
    // "Not seated") - built by the caller, same pattern as occupiedText
    // above.
    statusText: string;
    // Already-formatted "Table 03 (2), Table 07 (1)" or '-' if unseated.
    tableSummary: string;
}

export interface SeatingExportLabels {
    tablesSheet: string;
    unseatedSheet: string;
    fullListSheet: string;
    guestColumn: string;
    categoryColumn: string;
    guestSeatsColumn: string;
    remainingColumn: string;
    tableFullBadge: string;
    listColumnName: string;
    listColumnSide: string;
    listColumnCategory: string;
    listColumnInvited: string;
    listColumnStatus: string;
    listColumnTables: string;
}

interface ExportSeatingChartOptions {
    tables: SeatingExportTable[];
    unseated: SeatingExportUnseatedGuest[];
    fullList: SeatingExportListRow[];
    labels: SeatingExportLabels;
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

// Light banding on the "full list" sheet only - it's a long, flat table
// (unlike the tables sheet, which is already broken up into per-table
// blocks) so alternating row shading is what actually makes "nicely
// designed and clear" mean something here: it keeps a wide row readable
// without having to trace it with a finger/cursor.
const bandedTextCell = (value: string, isBanded: boolean): Cell => ({
    value,
    type: String,
    wrap: true,
    alignVertical: 'top',
    backgroundColor: isBanded ? '#F3F4F6' : '#FFFFFF',
});

export async function exportSeatingChart({ tables, unseated, fullList, labels, isRtl }: ExportSeatingChartOptions) {
    const tablesData: SheetData = [];

    tables.forEach((table) => {
        tablesData.push([
            {
                value: table.name,
                type: String,
                fontWeight: 'bold',
                fontSize: 14,
                textColor: '#1F2937',
            },
        ]);
        tablesData.push([
            {
                value: table.isFull ? `${table.occupiedText} · ${labels.tableFullBadge}` : table.occupiedText,
                type: String,
                fontSize: 11,
                textColor: '#4B5563',
            },
        ]);
        tablesData.push(
            [labels.guestColumn, labels.categoryColumn, labels.guestSeatsColumn].map((value) => ({ value, type: String, ...headerStyle })),
        );
        if (table.guests.length === 0) {
            tablesData.push([textCell('-'), textCell(''), '']);
        } else {
            table.guests.forEach((guest) => {
                tablesData.push([textCell(guest.name), textCell(guest.category), guest.seats]);
            });
        }
        tablesData.push([]);
    });

    const unseatedData: SheetData = [
        [labels.guestColumn, labels.categoryColumn, labels.remainingColumn].map((value) => ({ value, type: String, ...headerStyle })),
        ...unseated.map((guest) => [textCell(guest.name), textCell(guest.category), guest.remaining]),
    ];

    // Full, flat, sorted guest list (every confirmed guest, seated or not) -
    // the caller already sorts `fullList` by name before passing it in, same
    // as the tables sheet above.
    const fullListData: SheetData = [
        [
            labels.listColumnName,
            labels.listColumnSide,
            labels.listColumnCategory,
            labels.listColumnInvited,
            labels.listColumnStatus,
            labels.listColumnTables,
        ].map((value) => ({ value, type: String, ...headerStyle })),
        ...fullList.map((row, index) => [
            bandedTextCell(row.name, index % 2 === 1),
            bandedTextCell(row.side, index % 2 === 1),
            bandedTextCell(row.category, index % 2 === 1),
            { value: row.invitedCount, type: Number, backgroundColor: index % 2 === 1 ? '#F3F4F6' : '#FFFFFF', alignVertical: 'top' as const },
            bandedTextCell(row.statusText, index % 2 === 1),
            bandedTextCell(row.tableSummary, index % 2 === 1),
        ]),
    ];

    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const date = new Date().toISOString().slice(0, 10);

    await writeXlsxFile(
        [
            {
                data: tablesData,
                sheet: labels.tablesSheet,
                columns: [{ width: 28 }, { width: 20 }, { width: 12 }],
                rightToLeft: isRtl,
                orientation: 'landscape',
            },
            {
                data: fullListData,
                sheet: labels.fullListSheet,
                columns: [{ width: 22 }, { width: 22 }, { width: 20 }, { width: 12 }, { width: 18 }, { width: 26 }],
                stickyRowsCount: 1,
                rightToLeft: isRtl,
                orientation: 'landscape',
            },
            {
                data: unseatedData,
                sheet: labels.unseatedSheet,
                columns: [{ width: 28 }, { width: 20 }, { width: 14 }],
                stickyRowsCount: 1,
                rightToLeft: isRtl,
                orientation: 'landscape',
            },
        ],
    ).toFile(`seating-chart-${date}.xlsx`);
}
