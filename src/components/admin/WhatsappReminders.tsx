import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, MessageCircle, Pencil, Phone, RefreshCw, Search, X } from 'lucide-react';
import type { NormalizedBaseListEntry } from '../../utils/baseList';
import type { BaseListSyncResult } from '../../services/baseList';
import { normalizePhoneDigits, toWhatsappDialableNumber } from '../../utils/phoneNumbers';

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
    editNameButton: string;
    editNamePlaceholder: string;
    saveEditButton: string;
    editNameError: string;
    addPhoneButton: string;
    addPhonePlaceholder: string;
    savePhoneButton: string;
    addPhoneError: string;
    addPhoneInvalid: string;
}

interface WhatsappRemindersProps {
    baseList: NormalizedBaseListEntry[];
    respondedPhones: Set<string>;
    isLoading: boolean;
    onSync: () => Promise<BaseListSyncResult>;
    labels: WhatsappRemindersLabels;
    // Fixes a guest's name directly in baseList (the phone-list collection),
    // independent of the guest roster - baseList only otherwise gets written
    // by re-syncing the whole phone-list sheet, which Gil never edits
    // directly, so a name that's wrong there (but has since been corrected in
    // the roster) would otherwise be permanently stuck, keeping this tab
    // showing "still pending" forever for that guest even after they've
    // actually confirmed.
    onUpdateGuestName: (phone: string, name: string, group: string) => Promise<void>;
    // Roster entries that still haven't answered but have no matching phone
    // number in baseList at all - the reason this tab's counts never quite
    // match the roster's own "still pending" total by side: baseList counts
    // unique phone/name rows (a couple sharing one phone is one row here but
    // two invited people in the roster's headcount), and on top of that,
    // anyone missing from the phone sheet entirely is invisible to this whole
    // tab. Surfacing them here is what actually explains the gap, instead of
    // leaving Gil to wonder why the numbers disagree.
    missingPhoneGuests: WhatsappRemindersMissingPhoneGuest[];
    // Lets Gil add a phone number for one of these guests right here, in one
    // step - creates (or upserts) the matching baseList entry directly,
    // rather than requiring him to add the guest to the external phone-number
    // spreadsheet and re-run the sync just to cover a single person. Once
    // saved, the guest disappears from missingPhoneGuests on its own (their
    // name now matches a real baseList entry) and shows up in the reminders
    // list like everyone else.
    onAddPhone: (name: string, group: string, phone: string) => Promise<void>;
}

const TEMPLATE_STORAGE_KEY = 'wedding-admin-wa-reminder-template';

// Catches characters that will look fine right here (this browser has a font
// that happens to cover them) but would show up as a broken "◆?" placeholder
// wherever they're displayed with a font that doesn't cover them. Only two
// real causes: (1) the Unicode REPLACEMENT CHARACTER itself, meaning some
// earlier copy/paste already silently destroyed the original bytes before
// they ever reached this textarea, and (2) Private Use Area codepoints -
// these have no universal meaning, they only display as an emoji/symbol when
// the exact font that defined them is loaded (common when text is copied out
// of a PDF or a custom icon font), and every other font just shows a
// placeholder. Deliberately does NOT flag ordinary, valid, recently-added
// emoji (e.g. white heart) - those display correctly on any device with an
// up-to-date emoji font (which is true of essentially every phone), so
// treating them as "broken" would wrongly tell Gil to delete a perfectly
// good character. Iterating with `for...of` (not `.split('')`) is important
// so a real emoji's surrogate pair is checked as one codepoint instead of
// two meaningless halves.
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
        if (isReplacementChar || isPrivateUseArea) {
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

// Deliberately builds the api.whatsapp.com/send URL directly instead of the
// shorter wa.me/<phone>?text=<encoded> shortcut. Confirmed by inspecting the
// actual outgoing URL (Gil captured it from the browser's own address bar):
// clicking a wa.me link from inside a loaded webpage (as opposed to a direct
// OS-level tap/navigation, which lets phones route it straight to the native
// app via a universal link) makes the browser hit WhatsApp's own wa.me
// redirect server, which forwards to api.whatsapp.com/send/?phone=...&text=...
// - and it's THAT server-side redirect step that was silently replacing
// certain multi-byte emoji with the Unicode replacement character (confirmed
// via the %EF%BF%BD bytes - literal U+FFFD - showing up in place of the
// hearts in the redirected URL, even though the exact same text encoded and
// decoded correctly in plain Node.js, and even though a hand-built link to
// the very same endpoint worked perfectly). Building the final
// api.whatsapp.com/send URL ourselves skips that redirect hop entirely, so
// there's nothing left for WhatsApp's server to silently rewrite.
function buildWaHref(guest: NormalizedBaseListEntry, template: string, siteOrigin: string): string {
    const link = `${siteOrigin}/link/${guest.phone}`;
    const message = buildMessage(template, guest.name, link);
    const params = new URLSearchParams({
        phone: toWhatsappDialableNumber(guest.phone),
        text: message,
        type: 'phone_number',
        app_absent: '0',
    });
    return `https://api.whatsapp.com/send/?${params.toString()}`;
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
export function WhatsappReminders({ baseList, respondedPhones, isLoading, onSync, labels, missingPhoneGuests, onUpdateGuestName, onAddPhone }: WhatsappRemindersProps) {
    const [isMissingPhoneOpen, setIsMissingPhoneOpen] = useState(false);
    const [editingPhone, setEditingPhone] = useState<string | null>(null);
    const [editNameValue, setEditNameValue] = useState('');
    const [isSavingName, setIsSavingName] = useState(false);
    const [editNameErrorPhone, setEditNameErrorPhone] = useState<string | null>(null);
    // Keyed the same way as each missingPhoneGuests <li> (`${name}-${index}`)
    // since these guests have no id/phone of their own yet - that's exactly
    // the thing being added.
    const [addingPhoneKey, setAddingPhoneKey] = useState<string | null>(null);
    const [addPhoneValue, setAddPhoneValue] = useState('');
    const [isSavingPhone, setIsSavingPhone] = useState(false);
    const [addPhoneErrorKey, setAddPhoneErrorKey] = useState<string | null>(null);
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

    const startEditingName = (guest: NormalizedBaseListEntry) => {
        setEditingPhone(guest.phone);
        setEditNameValue(guest.name);
        setEditNameErrorPhone(null);
    };

    const cancelEditingName = () => {
        setEditingPhone(null);
        setEditNameValue('');
    };

    const handleSaveName = async (guest: NormalizedBaseListEntry) => {
        const trimmed = editNameValue.trim();
        if (!trimmed) {
            setEditNameErrorPhone(guest.phone);
            return;
        }
        setIsSavingName(true);
        setEditNameErrorPhone(null);
        try {
            await onUpdateGuestName(guest.phone, trimmed, guest.group);
            setEditingPhone(null);
            setEditNameValue('');
        } catch (error) {
            console.error('Failed to update baseList guest name', error);
            setEditNameErrorPhone(guest.phone);
        } finally {
            setIsSavingName(false);
        }
    };

    const startAddingPhone = (key: string) => {
        setAddingPhoneKey(key);
        setAddPhoneValue('');
        setAddPhoneErrorKey(null);
    };

    const cancelAddingPhone = () => {
        setAddingPhoneKey(null);
        setAddPhoneValue('');
    };

    const handleSavePhone = async (key: string, guest: WhatsappRemindersMissingPhoneGuest) => {
        const digits = normalizePhoneDigits(addPhoneValue);
        if (!digits) {
            setAddPhoneErrorKey(`invalid:${key}`);
            return;
        }
        setIsSavingPhone(true);
        setAddPhoneErrorKey(null);
        try {
            await onAddPhone(guest.name, guest.category, digits);
            setAddingPhoneKey(null);
            setAddPhoneValue('');
        } catch (error) {
            console.error('Failed to add baseList phone number', error);
            setAddPhoneErrorKey(`save:${key}`);
        } finally {
            setIsSavingPhone(false);
        }
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
                            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
                                {missingPhoneGuests.map((guest, index) => {
                                    const key = `${guest.name}-${index}`;
                                    const isAddingThisGuest = addingPhoneKey === key;
                                    return (
                                        <li key={key} className="rounded-lg bg-white/60 px-2 py-1 dark:bg-slate-900/40">
                                            {isAddingThisGuest ? (
                                                <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                                                    <span className="truncate font-medium">{guest.name}</span>
                                                    <input
                                                        type="text"
                                                        inputMode="tel"
                                                        dir="ltr"
                                                        value={addPhoneValue}
                                                        onChange={(event) => setAddPhoneValue(event.target.value)}
                                                        placeholder={labels.addPhonePlaceholder}
                                                        autoFocus
                                                        className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSavePhone(key, guest)}
                                                        disabled={isSavingPhone}
                                                        aria-label={labels.savePhoneButton}
                                                        title={labels.savePhoneButton}
                                                        className="inline-flex shrink-0 items-center rounded-lg bg-gray-900 p-1.5 text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                                                    >
                                                        {isSavingPhone ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={cancelAddingPhone}
                                                        className="inline-flex shrink-0 items-center rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                                    >
                                                        <X size={13} />
                                                    </button>
                                                    {addPhoneErrorKey === `invalid:${key}` && (
                                                        <span className="w-full text-xs text-rose-600 dark:text-rose-400">{labels.addPhoneInvalid}</span>
                                                    )}
                                                    {addPhoneErrorKey === `save:${key}` && (
                                                        <span className="w-full text-xs text-rose-600 dark:text-rose-400">{labels.addPhoneError}</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="flex min-w-0 items-center gap-1.5">
                                                        <span className="truncate">{guest.name}</span>
                                                        {guest.category && <span className="shrink-0 opacity-70">{guest.category}</span>}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => startAddingPhone(key)}
                                                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-rose-100 px-2 py-1 font-medium text-rose-800 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-200 dark:hover:bg-rose-900/60"
                                                    >
                                                        <Phone size={11} />
                                                        {labels.addPhoneButton}
                                                    </button>
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
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
                            const isEditingThisGuest = editingPhone === guest.phone;

                            return (
                                <div key={guest.phone} className="flex items-center gap-3 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelected(guest.phone)}
                                        className="h-4 w-4 shrink-0 rounded border-gray-300 text-gray-900 focus:ring-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                                    />
                                    <div className="min-w-0 flex-1">
                                        {isEditingThisGuest ? (
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <input
                                                    type="text"
                                                    value={editNameValue}
                                                    onChange={(event) => setEditNameValue(event.target.value)}
                                                    placeholder={labels.editNamePlaceholder}
                                                    autoFocus
                                                    dir="auto"
                                                    className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-700"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleSaveName(guest)}
                                                    disabled={isSavingName}
                                                    aria-label={labels.saveEditButton}
                                                    title={labels.saveEditButton}
                                                    className="inline-flex shrink-0 items-center rounded-lg bg-gray-900 p-1.5 text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                                                >
                                                    {isSavingName ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelEditingName}
                                                    className="inline-flex shrink-0 items-center rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="flex items-center gap-1.5 truncate font-medium text-gray-900 dark:text-slate-100">
                                                <span className="truncate">{guest.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => startEditingName(guest)}
                                                    aria-label={labels.editNameButton}
                                                    title={labels.editNameButton}
                                                    className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                                                >
                                                    <Pencil size={12} />
                                                </button>
                                            </p>
                                        )}
                                        {editNameErrorPhone === guest.phone && (
                                            <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">{labels.editNameError}</p>
                                        )}
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
