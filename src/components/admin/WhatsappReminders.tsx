import { useMemo, useState } from 'react';
import { Loader2, MessageCircle, RefreshCw, Search, X } from 'lucide-react';
import type { NormalizedBaseListEntry } from '../../utils/baseList';
import type { BaseListSyncResult } from '../../services/baseList';
import { toWhatsappDialableNumber } from '../../utils/phoneNumbers';

export interface WhatsappRemindersLabels {
    title: string;
    subtitle: string;
    loading: string;
    noGuests: string;
    templateLabel: string;
    templateHelp: string;
    templateDefault: string;
    previewLabel: string;
    tip: string;
    searchPlaceholder: string;
    filterAll: string;
    filterPending: string;
    alreadyResponded: string;
    sendButton: string;
    countLabel: string;
    selectedTitle: string;
    selectedHelp: string;
    clearSelection: string;
    groupFilterAll: string;
    selectAllVisible: string;
    deselectAllVisible: string;
    syncButton: string;
    syncing: string;
    syncUpserted: string;
    syncSkipped: string;
    syncNone: string;
    syncError: string;
    openAllButton: string;
    openAllHelp: string;
}

interface WhatsappRemindersProps {
    baseList: NormalizedBaseListEntry[];
    respondedPhones: Set<string>;
    isLoading: boolean;
    onSync: () => Promise<BaseListSyncResult>;
    labels: WhatsappRemindersLabels;
}

const TEMPLATE_STORAGE_KEY = 'wedding-admin-wa-reminder-template';

function formatPhoneForDisplay(digits: string): string {
    // Purely cosmetic grouping for a typical 10-digit Israeli mobile
    // (05X-XXX-XXXX) - falls back to the raw digits for anything else
    // (already-international numbers, unusual lengths, etc.) rather than
    // guessing wrong.
    if (/^0\d{9}$/.test(digits)) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return digits;
}

function buildMessage(template: string, name: string, link: string): string {
    return template.replace(/\{\{\s*name\s*\}\}/gi, name).replace(/\{\{\s*link\s*\}\}/gi, link);
}

function buildWaHref(guest: NormalizedBaseListEntry, template: string, siteOrigin: string): string {
    const link = `${siteOrigin}/link/${guest.phone}`;
    const message = buildMessage(template, guest.name, link);
    return `https://wa.me/${toWhatsappDialableNumber(guest.phone)}?text=${encodeURIComponent(message)}`;
}

// Lets Gil send a personalized WhatsApp reminder (with each guest's own
// invite link) to every guest one at a time, with zero typing - the message
// is fully pre-filled via WhatsApp's official "click to chat" (wa.me) links,
// he only has to press Send in WhatsApp itself. This deliberately stops
// short of full automation: WhatsApp bans accounts that message people at
// scale in an "unauthorized" (bot-driven) way, and a real human clicking
// through a list of pre-filled links is the compliant, safe version of that.
export function WhatsappReminders({ baseList, respondedPhones, isLoading, onSync, labels }: WhatsappRemindersProps) {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const [syncIsError, setSyncIsError] = useState(false);
    const [template, setTemplate] = useState<string>(() => {
        try {
            return window.localStorage.getItem(TEMPLATE_STORAGE_KEY) || labels.templateDefault;
        } catch {
            return labels.templateDefault;
        }
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMode, setFilterMode] = useState<'all' | 'pending'>('pending');
    // Empty string means "every group" - lets Gil narrow the list down to one
    // group/side first (e.g. "עבודה דפנה"), then decide whether to select all
    // of them at once or just a few, instead of scrolling the full guest list
    // to find that group's people one at a time.
    const [groupFilter, setGroupFilter] = useState('');
    // Independent of search/filter - lets Gil search for "ליאור", check him
    // off, then search for "אור כהן", check him off too, etc., building up a
    // shortlist across several searches instead of losing earlier picks each
    // time the search term changes. The "selected" panel below then shows
    // every one of them with their Send button ready, so he can click
    // through just that shortlist quickly instead of hunting the whole
    // guest list one name at a time.
    const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());

    // Deliberately hardcoded to the real guest-facing domain rather than
    // window.location.origin - the admin dashboard itself is sometimes still
    // opened from the old vercel.app URL, but the links guests actually
    // receive must always be the real wedding domain regardless of which URL
    // Gil happens to be looking at the dashboard from right now.
    const siteOrigin = 'https://www.shellygilwedding.com';

    const handleTemplateChange = (value: string) => {
        setTemplate(value);
        try {
            window.localStorage.setItem(TEMPLATE_STORAGE_KEY, value);
        } catch {
            // Not critical if this fails (e.g. private browsing) - the
            // template just won't be remembered next time.
        }
    };

    const toggleSelected = (phone: string) => {
        setSelectedPhones((prev) => {
            const next = new Set(prev);
            if (next.has(phone)) {
                next.delete(phone);
            } else {
                next.add(phone);
            }
            return next;
        });
    };

    const sortedGuests = useMemo(
        () => [...baseList].sort((first, second) => first.name.localeCompare(second.name)),
        [baseList],
    );

    const groups = useMemo(
        () => Array.from(new Set(sortedGuests.map((guest) => guest.group).filter(Boolean))).sort((first, second) => first.localeCompare(second)),
        [sortedGuests],
    );

    const visibleGuests = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return sortedGuests.filter((guest) => {
            if (filterMode === 'pending' && respondedPhones.has(guest.phone)) return false;
            if (groupFilter && guest.group !== groupFilter) return false;
            if (!term) return true;
            return guest.name.toLowerCase().includes(term) || guest.group.toLowerCase().includes(term) || guest.phone.includes(term);
        });
    }, [sortedGuests, filterMode, groupFilter, respondedPhones, searchTerm]);

    const selectedGuests = useMemo(
        () => sortedGuests.filter((guest) => selectedPhones.has(guest.phone)),
        [sortedGuests, selectedPhones],
    );

    const areAllVisibleSelected = visibleGuests.length > 0 && visibleGuests.every((guest) => selectedPhones.has(guest.phone));

    const toggleSelectAllVisible = () => {
        setSelectedPhones((prev) => {
            const next = new Set(prev);
            if (areAllVisibleSelected) {
                visibleGuests.forEach((guest) => next.delete(guest.phone));
            } else {
                visibleGuests.forEach((guest) => next.add(guest.phone));
            }
            return next;
        });
    };

    const handleSync = async () => {
        setIsSyncing(true);
        setSyncMessage('');
        setSyncIsError(false);
        try {
            const result = await onSync();
            if (result.upsertedCount === 0) {
                setSyncMessage(labels.syncNone);
            } else {
                const parts = [`${labels.syncUpserted}: ${result.upsertedCount}`];
                if (result.skippedCount > 0) {
                    parts.push(`${labels.syncSkipped}: ${result.skippedCount}`);
                }
                setSyncMessage(parts.join(' · '));
            }
        } catch (error) {
            setSyncIsError(true);
            setSyncMessage(error instanceof Error ? error.message : labels.syncError);
        } finally {
            setIsSyncing(false);
        }
    };

    // Opens a wa.me tab per shortlisted guest, staggered slightly so browser
    // popup blockers are less likely to swallow tabs after the first one -
    // this is the safe middle ground for "send to a few people at once":
    // every tab still requires Gil to press Send himself inside WhatsApp, so
    // no message actually goes out without a real human click, but he no
    // longer has to go back to the dashboard between each guest.
    const handleOpenAllSelected = () => {
        selectedGuests.forEach((guest, index) => {
            window.setTimeout(() => {
                window.open(buildWaHref(guest, template, siteOrigin), '_blank', 'noopener,noreferrer');
            }, index * 350);
        });
    };

    const previewGuest = selectedGuests[0] ?? visibleGuests[0] ?? sortedGuests[0];
    const previewMessage = previewGuest
        ? buildMessage(template, previewGuest.name, `${siteOrigin}/link/${previewGuest.phone}`)
        : buildMessage(template, 'שם המוזמן', `${siteOrigin}/link/0500000000`);

    return (
        <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">{labels.title}</h2>
                    <p className="mt-1 text-sm text-gray-500">{labels.subtitle}</p>
                </div>
                <button
                    type="button"
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {isSyncing ? labels.syncing : labels.syncButton}
                </button>
            </div>

            <div className="space-y-4 p-5">
                {syncMessage && (
                    <div className={`rounded-2xl border px-4 py-3 text-sm ${syncIsError ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
                        {syncMessage}
                    </div>
                )}

                <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {labels.tip}
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{labels.templateLabel}</label>
                    <textarea
                        value={template}
                        onChange={(event) => handleTemplateChange(event.target.value)}
                        rows={3}
                        dir="auto"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    />
                    <p className="mt-1 text-xs text-gray-500">{labels.templateHelp}</p>
                </div>

                <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{labels.previewLabel}</p>
                    <p className="whitespace-pre-wrap rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-3 text-sm text-gray-800" dir="auto">
                        {previewMessage}
                    </p>
                </div>

                {selectedGuests.length > 0 && (
                    <div className="rounded-2xl border border-gray-900/10 bg-gray-50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                                <p className="text-sm font-semibold text-gray-900">{labels.selectedTitle} ({selectedGuests.length})</p>
                                <p className="text-xs text-gray-500">{labels.selectedHelp}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSelectedPhones(new Set())}
                                    className="text-xs font-medium text-rose-600 underline underline-offset-2"
                                >
                                    {labels.clearSelection}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleOpenAllSelected}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
                                >
                                    <MessageCircle size={14} />
                                    {labels.openAllButton}
                                </button>
                            </div>
                        </div>
                        <p className="mb-2 text-xs text-gray-500">{labels.openAllHelp}</p>
                        <div className="max-h-72 divide-y divide-gray-200 overflow-y-auto rounded-xl border border-gray-200 bg-white">
                            {selectedGuests.map((guest) => (
                                <div key={guest.phone} className="flex items-center gap-2 px-3 py-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleSelected(guest.phone)}
                                        className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                        aria-label={labels.clearSelection}
                                    >
                                        <X size={14} />
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-gray-900">{guest.name}</p>
                                        <p className="text-xs text-gray-500" dir="ltr">{formatPhoneForDisplay(guest.phone)}</p>
                                    </div>
                                    <a
                                        href={buildWaHref(guest, template, siteOrigin)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
                                    >
                                        <MessageCircle size={14} />
                                        {labels.sendButton}
                                    </a>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder={labels.searchPlaceholder}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 ps-9 pe-3 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        />
                    </div>
                    <select
                        value={groupFilter}
                        onChange={(event) => setGroupFilter(event.target.value)}
                        className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    >
                        <option value="">{labels.groupFilterAll}</option>
                        {groups.map((group) => (
                            <option key={group} value={group}>{group}</option>
                        ))}
                    </select>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setFilterMode('pending')}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filterMode === 'pending' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            {labels.filterPending}
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterMode('all')}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filterMode === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            {labels.filterAll}
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">{visibleGuests.length} {labels.countLabel}</p>
                    {visibleGuests.length > 0 && (
                        <button
                            type="button"
                            onClick={toggleSelectAllVisible}
                            className="text-xs font-medium text-gray-700 underline underline-offset-2"
                        >
                            {areAllVisibleSelected ? labels.deselectAllVisible : labels.selectAllVisible}
                        </button>
                    )}
                </div>

                {isLoading ? (
                    <p className="py-8 text-center text-sm text-gray-500">{labels.loading}</p>
                ) : visibleGuests.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-500">{labels.noGuests}</p>
                ) : (
                    <div className="max-h-[32rem] divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-100">
                        {visibleGuests.map((guest) => {
                            const hasResponded = respondedPhones.has(guest.phone);
                            const isSelected = selectedPhones.has(guest.phone);

                            return (
                                <div key={guest.phone} className="flex items-center gap-3 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelected(guest.phone)}
                                        className="h-4 w-4 shrink-0 rounded border-gray-300 text-gray-900 focus:ring-gray-300"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium text-gray-900">{guest.name}</p>
                                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                                            <span dir="ltr">{formatPhoneForDisplay(guest.phone)}</span>
                                            {guest.group && <span>· {guest.group}</span>}
                                            {hasResponded && (
                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                                                    {labels.alreadyResponded}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <a
                                        href={buildWaHref(guest, template, siteOrigin)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
                                    >
                                        <MessageCircle size={14} />
                                        {labels.sendButton}
                                    </a>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
