import { useMemo, useState } from 'react';
import { MessageCircle, Search } from 'lucide-react';
import type { NormalizedBaseListEntry } from '../../utils/baseList';
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
}

interface WhatsappRemindersProps {
    baseList: NormalizedBaseListEntry[];
    respondedPhones: Set<string>;
    isLoading: boolean;
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

// Lets Gil send a personalized WhatsApp reminder (with each guest's own
// invite link) to every guest one at a time, with zero typing - the message
// is fully pre-filled via WhatsApp's official "click to chat" (wa.me) links,
// he only has to press Send in WhatsApp itself. This deliberately stops
// short of full automation: WhatsApp bans accounts that message people at
// scale in an "unauthorized" (bot-driven) way, and a real human clicking
// through a list of pre-filled links is the compliant, safe version of that.
export function WhatsappReminders({ baseList, respondedPhones, isLoading, labels }: WhatsappRemindersProps) {
    const [template, setTemplate] = useState<string>(() => {
        try {
            return window.localStorage.getItem(TEMPLATE_STORAGE_KEY) || labels.templateDefault;
        } catch {
            return labels.templateDefault;
        }
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMode, setFilterMode] = useState<'all' | 'pending'>('pending');

    const siteOrigin = typeof window !== 'undefined' ? window.location.origin : '';

    const handleTemplateChange = (value: string) => {
        setTemplate(value);
        try {
            window.localStorage.setItem(TEMPLATE_STORAGE_KEY, value);
        } catch {
            // Not critical if this fails (e.g. private browsing) - the
            // template just won't be remembered next time.
        }
    };

    const sortedGuests = useMemo(
        () => [...baseList].sort((first, second) => first.name.localeCompare(second.name)),
        [baseList],
    );

    const visibleGuests = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return sortedGuests.filter((guest) => {
            if (filterMode === 'pending' && respondedPhones.has(guest.phone)) return false;
            if (!term) return true;
            return guest.name.toLowerCase().includes(term) || guest.group.toLowerCase().includes(term) || guest.phone.includes(term);
        });
    }, [sortedGuests, filterMode, respondedPhones, searchTerm]);

    const previewGuest = visibleGuests[0] ?? sortedGuests[0];
    const previewMessage = previewGuest
        ? buildMessage(template, previewGuest.name, `${siteOrigin}/link/${previewGuest.phone}`)
        : buildMessage(template, 'שם המוזמן', `${siteOrigin}/link/0500000000`);

    return (
        <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md">
            <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-lg font-semibold text-gray-900">{labels.title}</h2>
                <p className="mt-1 text-sm text-gray-500">{labels.subtitle}</p>
            </div>

            <div className="space-y-4 p-5">
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

                <p className="text-xs text-gray-500">{visibleGuests.length} {labels.countLabel}</p>

                {isLoading ? (
                    <p className="py-8 text-center text-sm text-gray-500">{labels.loading}</p>
                ) : visibleGuests.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-500">{labels.noGuests}</p>
                ) : (
                    <div className="max-h-[32rem] divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-100">
                        {visibleGuests.map((guest) => {
                            const hasResponded = respondedPhones.has(guest.phone);
                            const link = `${siteOrigin}/link/${guest.phone}`;
                            const message = buildMessage(template, guest.name, link);
                            const waHref = `https://wa.me/${toWhatsappDialableNumber(guest.phone)}?text=${encodeURIComponent(message)}`;

                            return (
                                <div key={guest.phone} className="flex items-center gap-3 px-4 py-3">
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
                                        href={waHref}
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
