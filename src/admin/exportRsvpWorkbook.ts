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

// Mirrors GuestRosterEntry from services/guestRoster.ts - kept as its own
// type here so this module doesn't need to import the Firestore-facing
// service just for a shape.
export interface RosterExportEntry {
    side: string;
    category: string;
    firstName: string;
    lastName: string;
    invitedCount: number;
    knownResponse: 'yes' | 'no' | null;
    // Best-effort match against the baseList phone sheet by name (see
    // AdminDashboard.tsx's guestRosterForExport) - empty string when no
    // single unambiguous baseList entry matches this guest's name, same
    // "exactly one match or leave it blank" rule already used elsewhere in
    // the dashboard for cascading a roster name edit to baseList, so a
    // guest never gets shown with someone else's phone number.
    phone: string;
}

export interface RSVPExportLabels {
    summarySheet: string;
    recordsSheet: string;
    rosterSheet: string;
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
    rosterOverallHeading: string;
    rosterSideBreakdown: string;
    rosterTotalInvited: string;
    rosterConfirmed: string;
    rosterDeclined: string;
    rosterPending: string;
    rosterSide: string;
    rosterCategory: string;
    rosterInvitedCount: string;
    rosterStatus: string;
    rosterPhone: string;
    rosterName: string;
}

interface ExportRsvpWorkbookOptions {
    records: RSVPExportRecord[];
    guestRoster: RosterExportEntry[];
    plannedGuests: number;
    labels: RSVPExportLabels;
    isRtl: boolean;
}

interface RosterTotals {
    invited: number;
    confirmed: number;
    declined: number;
    pending: number;
}

function emptyRosterTotals(): RosterTotals {
    return { invited: 0, confirmed: 0, declined: 0, pending: 0 };
}

function addRosterEntry(totals: RosterTotals, entry: RosterExportEntry): void {
    totals.invited += entry.invitedCount;
    if (entry.knownResponse === 'yes') {
        totals.confirmed += entry.invitedCount;
    } else if (entry.knownResponse === 'no') {
        totals.declined += entry.invitedCount;
    } else {
        totals.pending += entry.invitedCount;
    }
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

function rosterStatusLabel(entry: RosterExportEntry, labels: RSVPExportLabels): string {
    if (entry.knownResponse === 'yes') return labels.attending;
    if (entry.knownResponse === 'no') return labels.notAttending;
    return labels.rosterPending;
}

export async function exportRsvpWorkbook({ records, guestRoster, plannedGuests, labels, isRtl }: ExportRsvpWorkbookOptions) {
    const attendingRecords = records.filter((record) => record.isAttending);
    const languageCounts = records.reduce<Record<string, number>>((counts, record) => {
        counts[record.lang] = (counts[record.lang] ?? 0) + 1;
        return counts;
    }, {});

    // Roster-wide totals (every invited guest, regardless of whether they've
    // submitted the site's RSVP form yet) - this is the number Gil actually
    // needs for planning, since it also counts guests whose response is only
    // known by phone/word of mouth and was recorded straight into the roster.
    const rosterOverallTotals = emptyRosterTotals();
    guestRoster.forEach((entry) => addRosterEntry(rosterOverallTotals, entry));

    const rosterBySide = new Map<string, RosterTotals>();
    guestRoster.forEach((entry) => {
        const totals = rosterBySide.get(entry.side) ?? emptyRosterTotals();
        addRosterEntry(totals, entry);
        rosterBySide.set(entry.side, totals);
    });
    const sortedSides = Array.from(rosterBySide.keys()).sort((first, second) => first.localeCompare(second));

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
        [],
        [
            { value: labels.rosterOverallHeading, type: String, fontWeight: 'bold', fontSize: 14, textColor: '#1F2937' },
            null,
        ],
        [{ value: labels.rosterTotalInvited, type: String, fontWeight: 'bold' }, rosterOverallTotals.invited],
        [{ value: labels.rosterConfirmed, type: String, fontWeight: 'bold' }, rosterOverallTotals.confirmed],
        [{ value: labels.rosterDeclined, type: String, fontWeight: 'bold' }, rosterOverallTotals.declined],
        [{ value: labels.rosterPending, type: String, fontWeight: 'bold' }, rosterOverallTotals.pending],
        [],
        [
            { value: labels.rosterSideBreakdown, type: String, fontWeight: 'bold' },
            { value: labels.rosterTotalInvited, type: String, fontWeight: 'bold' },
            { value: labels.rosterConfirmed, type: String, fontWeight: 'bold' },
            { value: labels.rosterDeclined, type: String, fontWeight: 'bold' },
            { value: labels.rosterPending, type: String, fontWeight: 'bold' },
        ],
        ...sortedSides.map((side) => {
            const totals = rosterBySide.get(side) ?? emptyRosterTotals();
            return [textCell(side), totals.invited, totals.confirmed, totals.declined, totals.pending];
        }),
    ];

    // One sheet per side (e.g. "רשימת מוזמנים - גיל" / "רשימת מוזמנים -
    // שלי") rather than one combined sheet - within each, grouped by
    // category/group with a small heading + subtotal row per group, then
    // guests sorted by name, so the sheet reads like an actual organized
    // guest list rather than a flat table Gil has to filter himself.
    const rosterSheets = sortedSides.map((side) => {
        const sideEntries = guestRoster.filter((entry) => entry.side === side);
        const sideTotals = rosterBySide.get(side) ?? emptyRosterTotals();
        const categoriesInSide = Array.from(new Set(sideEntries.map((entry) => entry.category || '-'))).sort(
            (first, second) => first.localeCompare(second, 'he'),
        );

        const rows: SheetData = [
            [{ value: `${labels.rosterSheet} - ${side}`, type: String, fontWeight: 'bold', fontSize: 16, textColor: '#1F2937' }],
            [],
            [{ value: labels.rosterTotalInvited, type: String, fontWeight: 'bold' }, sideTotals.invited],
            [{ value: labels.rosterConfirmed, type: String, fontWeight: 'bold' }, sideTotals.confirmed],
            [{ value: labels.rosterDeclined, type: String, fontWeight: 'bold' }, sideTotals.declined],
            [{ value: labels.rosterPending, type: String, fontWeight: 'bold' }, sideTotals.pending],
        ];

        categoriesInSide.forEach((category) => {
            const categoryEntries = [...sideEntries]
                .filter((entry) => (entry.category || '-') === category)
                .sort((first, second) => `${first.firstName} ${first.lastName}`.localeCompare(`${second.firstName} ${second.lastName}`, 'he'));
            const categoryInvitedCount = categoryEntries.reduce((sum, entry) => sum + entry.invitedCount, 0);

            rows.push([]);
            rows.push([
                { value: category, type: String, fontWeight: 'bold', fontSize: 13, textColor: '#1F2937' },
                null,
                { value: categoryInvitedCount, type: Number, fontWeight: 'bold' },
                null,
            ]);
            rows.push(
                [labels.rosterName, labels.rosterPhone, labels.rosterInvitedCount, labels.rosterStatus].map((value) => ({
                    value,
                    type: String,
                    ...headerStyle,
                })),
            );
            categoryEntries.forEach((entry) => {
                rows.push([
                    textCell(`${entry.firstName} ${entry.lastName}`.trim()),
                    { value: entry.phone || '-', type: String, align: 'center' as const },
                    entry.invitedCount,
                    textCell(rosterStatusLabel(entry, labels)),
                ]);
            });
        });

        return {
            data: rows,
            sheet: `${labels.rosterSheet} - ${side}`.slice(0, 31),
            columns: [{ width: 26 }, { width: 16 }, { width: 12 }, { width: 20 }],
            rightToLeft: isRtl,
            showGridLines: false,
        };
    });

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
            columns: [{ width: 30 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }],
            rightToLeft: isRtl,
            showGridLines: false,
        },
        ...rosterSheets,
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
