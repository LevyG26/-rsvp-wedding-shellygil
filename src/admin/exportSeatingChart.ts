import type { Cell, SheetData } from 'write-excel-file/browser';

export interface SeatingExportGuest {
    name: string;
    category: string;
    seats: number;
}

export interface SeatingExportTable {
    name: string;
    seatCount: number;
    used: number;
    guests: SeatingExportGuest[];
}

export interface SeatingExportUnseatedGuest {
    name: string;
    category: string;
    remaining: number;
}

export interface SeatingExportLabels {
    tablesSheet: string;
    unseatedSheet: string;
    guestColumn: string;
    categoryColumn: string;
    guestSeatsColumn: string;
    remainingColumn: string;
    tableFullBadge: string;
}

interface ExportSeatingChartOptions {
    tables: SeatingExportTable[];
    unseated: SeatingExportUnseatedGuest[];
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

export async function exportSeatingChart({ tables, unseated, labels, isRtl }: ExportSeatingChartOptions) {
    const tablesData: SheetData = [];

    tables.forEach((table) => {
        const statusSuffix = table.used >= table.seatCount ? ` (${labels.tableFullBadge})` : '';
        tablesData.push([
            {
                value: `${table.name} - ${table.used}/${table.seatCount}${statusSuffix}`,
                type: String,
                fontWeight: 'bold',
                fontSize: 13,
                textColor: '#1F2937',
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
