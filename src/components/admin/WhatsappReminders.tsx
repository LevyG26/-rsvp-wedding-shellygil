import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, MessageCircle, RefreshCw, Search, X } from 'lucide-react';
import type { NormalizedBaseListEntry } from '../../utils/baseList';
import type { BaseListSyncResult } from '../../services/baseList';
import { toWhatsappDialableNumber } from '../../utils/phoneNumbers';

export interface WhatsappRemindersMissingPhoneGuest {
    name: string;
    category: string;
}

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
    openAllMobileNote: string;
    missingPhoneHeading: string;
    missingPhoneHint: string;
    suspiciousCharsWarning: string;
    removeSuspiciousCharsButton: string;
}

interface WhatsappRemindersProps {
    baseList: NormalizedBaseListEntry[];
    respondedPhones: Set<string>;
    isLoading: boolean;
    onSync: () => Promise<BaseListSyncResult>;
    labels: WhatsappRemindersLabels;
    // Roster entries that still haven't answered but have no matching phone
    // number in baseList at all - the reason this tab's counts never quite
    // match the roster's own "still pending" total by side: baseList counts
    // unique phone/name rows (a couple sharing one phone is one row here but
    // two invited people in the roster's headcount), and on top of that,
    // anyone missing from the phone sheet entirely is invisible to this whole
    // tab. Surfacing them here is what actually explains the gap, instead of
    // leaving Gil to wonder why the numbers disagree.
    missingPhoneGuests: WhatsappRemindersMissingPhoneGuest[];
}

const TEMPLATE_STORAGE_KEY = 'wedding-admin-wa-reminder-template';

// Specific, real, valid emoji that are still "too new" to count on:
// standard Unicode characters (not corrupted, not private-use), but added to
// the Emoji standard recently enough (2019-2023) that older phones/OS
// versions/WhatsApp builds don't have a picture for them yet, and fall back
// to the same broken "◆?" placeholder - this is a device-side gap, not
// something any app can fix, so the only real fix is not using them. This is
// exactly what caught out a plain red-heart-and-white-heart message: red
// heart (❤️) is from 2010 and works everywhere, white heart (🤍) is from
// 2019 and doesn't yet. Deliberately a short, hand-picked list of the ones
// actually likely to show up in a wedding message, not every recent emoji in
// existence.
const RISKY_NEWER_EMOJI_CODEPOINTS = new Set<number>([
    0x1f90d, // white heart (Emoji 12.0, 2019)
    0x1f90e, // brown heart (Emoji 12.0, 2019)
    0x1fa75, // light blue heart (Emoji 15.0, 2023)
    0x1fa76, // grey heart (Emoji 15.0, 2023)
    0x1fa77, // pink heart (Emoji 15.0, 2023)
    0x1faf6, // heart hands (Emoji 14.0, 2022)
]);

// Catches characters that will look fine right here (this browser has a font
// that happens to cover them) but are likely to render as a broken "◆?"
// placeholder once the message actually reaches WhatsApp on a guest's phone.
// Three causes, all lumped into one check since the fix (remove/replace) is
// the same for each: (1) the Unicode REPLACEMENT CHARACTER itself, meaning
// some earlier copy/paste already silently destroyed the original bytes
// before they ever reached this textarea; (2) Private Use Area codepoints -
// these have no universal meaning, they only display as an emoji/symbol when
// the exact font that defined them is loaded (common when text is copied out
// of a PDF or a custom icon font), and every other device just shows a
// placeholder; (3) real, valid emoji that are simply too recently added to
// Unicode for every guest's phone to have caught up yet (see
// RISKY_NEWER_EMOJI_CODEPOINTS above). Iterating with `for...of` (not
// `.split('')`) is important so a real emoji's surrogate pair is checked as
// one codepoint instead of two meaningless halves.
function findSuspiciousTemplateCharacters(template: string): string[] {
    const found = new Set<string>();
    for (const char of template) {
        const codePoint = char.codePointAt(0);
        if (codePoint === undefined) continue;
        const isReplacementChar = codePoint === 0xfffd;
        const isPrivateUseArea =
            (codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
            (codePoint >= 0xf0000 && codePoint <= 0xffffd) ||
            (codePoint >= 0x100000 && codePoint <= 0x10fffd);
        const isRiskyNewerEmoji = RISKY_NEWER_EMOJI_CODEPOINTS.has(codePoint);
        if (isReplacementChar || isPrivateUseArea || isRiskyNewerEmoji) {
            found.add(char);
        }
    }
    return Array.from(found);
}

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

// On phones, a wa.me link hands the whole browser tab off to the WhatsApp
// app itself (rather than opening a new browser tab the way it does on
// desktop) - so the page is suspended the moment the first link is followed,
// and any further staggered window.open() calls queued behind it never get
// a chance to run. "Open all" is a desktop-only convenience for that reason;
// on mobile we hide it and just point Gil at the one-at-a-time Send buttons,
// which already work fine there.
function isMobileUserAgent(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Lets Gil send a personalized WhatsApp reminder (with each guest's own
// invite link) to every guest one at a time, with zero typing - the message
// is fully pre-filled via WhatsApp's official "click to chat" (wa.me) links,
// he only has to press Send in WhatsApp itself. This deliberately stops
// short of full automation: WhatsApp bans accounts that message people at
// scale in an "unauthorized" (bot-driven) way, and a real human clicking
// through a list of pre-filled links is the compliant, safe version of that.
export function WhatsappReminders({ baseList, respondedPhones, isLoading, onSync, labels, missingPhoneGuests }: WhatsappRemindersProps) {
    const [isMissingPhoneOpen, setIsMissingPhoneOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const [syncIsError, setSyncIsError] = useState(false);
    const [isMobile] = useState(isMobileUserAgent);
    const [template, setTemplate] = useState<string>(() => {
        try {
            return window.localStorage.getItem(TEMPLATE_STORAGE_KEY) || labels.templateDefault;
        } catch {
            return labels.templateDefault;
        }
    });
    const suspiciousTemplateCharacters = useMemo(() => findSuspiciousTemplateCharacters(template), [template]);

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

    // One click fixes the ONE shared template, not each guest - every "Send"
    // afterward (for every guest, forever) already pulls from this same
    // corrected text, since {{name}}/{{link}} substitution is the only thing
    // that changes per guest. There's nothing sensible to put back in place
    // of a stripped character (a Private Use Area codepoint or the Unicode
    // replacement character carries no real meaning to recover), so this
    // just removes it - Gil can retype a real emoji there afterward if he
    // wants one, but the message is safe to send either way.
    const handleRemoveSuspiciousCharacters = () => {
        const cleaned = Array.from(template)
            .filter((char) => !suspiciousTemplateCharacters.includes(char))
            .join('');
        handleTemplateChange(cleaned);
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
        <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-slate-700">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{labels.title}</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{labels.subtitle}</p>
                </div>
                <button
                    type="button"
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                    {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {isSyncing ? labels.syncing : labels.syncButton}
                </button>
            </div>

            <div className="space-y-4 p-5">
                {syncMessage && (
                    <div className={`rounded-2xl border px-4 py-3 text-sm ${syncIsError ? 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300' : 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                        {syncMessage}
                    </div>
                )}

                <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300">
                    {labels.tip}
                </div>

                {missingPhoneGuests.length > 0 && (
                    <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
                        <button
                            type="button"
                            onClick={() => setIsMissingPhoneOpen((open) => !open)}
                            className="flex w-full items-center justify-between gap-2 text-start font-medium"
                        >
                            <span className="flex items-center gap-2">
                                <AlertTriangle size={15} className="shrink-0" />
                                {labels.missingPhoneHeading.replace('{count}', String(missingPhoneGuests.length))}
                            </span>
                            <span className="shrink-0 text-xs underline underline-offset-2">{isMissingPhoneOpen ? '−' : '+'}</span>
                        </button>
                        <p className="mt-1 text-xs opacity-90">{labels.missingPhoneHint}</p>
                        {isMissingPhoneOpen && (
                            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                                {missingPhoneGuests.map((guest, index) => (
                                    <li key={`${guest.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/60 px-2 py-1 dark:bg-slate-900/40">
                                        <span className="truncate">{guest.name}</span>
                                        {guest.category && <span className="shrink-0 opacity-70">{guest.category}</span>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">{labels.templateLabel}</label>
                    <textarea
                        value={template}
                        onChange={(event) => handleTemplateChange(event.target.value)}
                        rows={3}
                        dir="auto"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{labels.templateHelp}</p>
                    {suspiciousTemplateCharacters.length > 0 && (
                        <div className="mt-2 flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <div className="flex-1">
                                <p>
                                    {labels.suspiciousCharsWarning} <span dir="ltr" className="font-mono">{suspiciousTemplateCharacters.join(' ')}</span>
                                </p>
                                <button
                                    type="button"
                                    onClick={handleRemoveSuspiciousCharacters}
                                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500"
                                >
                                    {labels.removeSuspiciousCharsButton}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">{labels.previewLabel}</p>
                    <p className="whitespace-pre-wrap rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-3 text-sm text-gray-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200" dir="auto">
                        {previewMessage}
                    </p>
                </div>

                {selectedGuests.length > 0 && (
                    <div className="rounded-2xl border border-gray-900/10 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{labels.selectedTitle} ({selectedGuests.length})</p>
                                <p className="text-xs text-gray-500 dark:text-slate-400">{labels.selectedHelp}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSelectedPhones(new Set())}
                                    className="text-xs font-medium text-rose-600 underline underline-offset-2 dark:text-rose-400"
                                >
                                    {labels.clearSelection}
                                </button>
                                {!isMobile && (
                                    <button
                                        type="button"
                                        onClick={handleOpenAllSelected}
                                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                                    >
                                        <MessageCircle size={14} />
                                        {labels.openAllButton}
                                    </button>
                                )}
                            </div>
                        </div>
                        <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">{isMobile ? labels.openAllMobileNote : labels.openAllHelp}</p>
                        <div className="max-h-72 divide-y divide-gray-200 overflow-y-auto rounded-xl border border-gray-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
                            {selectedGuests.map((guest) => (
                                <div key={guest.phone} className="flex items-center gap-2 px-3 py-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleSelected(guest.phone)}
                                        className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                                        aria-label={labels.clearSelection}
                                    >
                                        <X size={14} />
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">{guest.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-slate-400" dir="ltr">{formatPhoneForDisplay(guest.phone)}</p>
                                    </div>
                                    <a
                                        href={buildWaHref(guest, template, siteOrigin)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500"
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
                        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder={labels.searchPlaceholder}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 ps-9 pe-3 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700"
                        />
                    </div>
                    <select
                        value={groupFilter}
                        onChange={(event) => setGroupFilter(event.target.value)}
                        className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700"
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
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filterMode === 'pending' ? 'bg-gray-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                        >
                            {labels.filterPending}
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterMode('all')}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filterMode === 'all' ? 'bg-gray-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                        >
                            {labels.filterAll}
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 dark:text-slate-400">{visibleGuests.length} {labels.countLabel}</p>
                    {visibleGuests.length > 0 && (
                        <button
                            type="button"
                            onClick={toggleSelectAllVisible}
                            className="text-xs font-medium text-gray-700 underline underline-offset-2 dark:text-slate-300"
                        >
                            {areAllVisibleSelected ? labels.deselectAllVisible : labels.selectAllVisible}
                        </button>
                    )}
                </div>

                {isLoading ? (
                    <p className="py-8 text-center text-sm text-gray-500 dark:text-slate-400">{labels.loading}</p>
                ) : visibleGuests.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-500 dark:text-slate-400">{labels.noGuests}</p>
                ) : (
                    <div className="max-h-[32rem] divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-100 dark:divide-slate-700 dark:border-slate-700">
                        {visibleGuests.map((guest) => {
                            const hasResponded = respondedPhones.has(guest.phone);
                            const isSelected = selectedPhones.has(guest.phone);

                            return (
                                <div key={guest.phone} className="flex items-center gap-3 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelected(guest.phone)}
                                        className="h-4 w-4 shrink-0 rounded border-gray-300 text-gray-900 focus:ring-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium text-gray-900 dark:text-slate-100">{guest.name}</p>
                                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                                            <span dir="ltr">{formatPhoneForDisplay(guest.phone)}</span>
                                            {guest.group && <span>· {guest.group}</span>}
                                            {hasResponded && (
                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                                    {labels.alreadyResponded}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <a
                                        href={buildWaHref(guest, template, siteOrigin)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500"
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
