import { useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';

export interface InviteLinkVisitRecord {
  id: string;
  phone: string;
  guestName: string;
  guestGroup: string;
  lang: string;
  openedAt: Date | null;
}

interface InviteLinkVisitsTableLabels {
  title: string;
  subtitle: string;
  name: string;
  group: string;
  phone: string;
  status: string;
  language: string;
  openedAt: string;
  actions: string;
  loading: string;
  noRecords: string;
  attending: string;
  notAttending: string;
  pending: string;
  unknownName: string;
  unassignedGroup: string;
  deleteAction: string;
  deletingAction: string;
}

interface InviteLinkVisitsTableProps {
  visits: InviteLinkVisitRecord[];
  rsvpStatusByPhone: Map<string, boolean>;
  labels: InviteLinkVisitsTableLabels;
  formatDate: (value: Date | null) => string;
  isLoading: boolean;
  deletingVisitId: string | null;
  onDelete: (visitId: string) => void;
}

export function InviteLinkVisitsTable({
  visits,
  rsvpStatusByPhone,
  labels,
  formatDate,
  isLoading,
  deletingVisitId,
  onDelete,
}: InviteLinkVisitsTableProps) {
  // Collapsed by default: this panel used to always render its full table
  // inline, pushing the main RSVP responses table (what Gil actually checks
  // day to day) further down the page - collapsing it, with the count
  // visible right on the closed header, means he sees at a glance how many
  // guests opened their link without having to scroll past the whole list
  // to get to what he came here for.
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start"
      >
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{labels.title}</h2>
          <p className="mt-1 truncate text-sm text-gray-500 dark:text-slate-400">{labels.subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span dir="ltr" className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-slate-800 dark:text-slate-300">
            {visits.length}
          </span>
          <ChevronDown size={18} className={`text-gray-400 transition-transform dark:text-slate-500 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
      <div className="border-t border-gray-100 dark:border-slate-700">
      {isLoading ? (
        <div className="flex items-center justify-center gap-3 p-8 text-gray-600 dark:text-slate-400">
          <span className="h-5 w-5 rounded-full border-2 border-gray-200 border-t-gray-700 animate-spin dark:border-slate-700 dark:border-t-slate-300" />
          <span>{labels.loading}</span>
        </div>
      ) : visits.length === 0 ? (
        <div className="p-8 text-center text-gray-600 dark:text-slate-400">{labels.noRecords}</div>
      ) : (
        <>
        {/* Mobile card list */}
        <div className="divide-y divide-gray-100 md:hidden dark:divide-slate-700">
          {visits.map((visit) => {
            const rsvpStatus = rsvpStatusByPhone.get(visit.phone);
            const statusLabel = rsvpStatus === undefined
              ? labels.pending
              : rsvpStatus
                ? labels.attending
                : labels.notAttending;
            const statusClassName = rsvpStatus === undefined
              ? 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300'
              : rsvpStatus
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300';

            return (
              <div key={visit.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-slate-100">{visit.guestName || labels.unknownName}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{visit.guestGroup || labels.unassignedGroup}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400" dir="ltr">{visit.phone}</p>
                  </div>
                  <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusClassName}`}>
                    {statusLabel}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                  <span dir="ltr">{visit.lang.toUpperCase()}</span>
                  <span dir="ltr">{formatDate(visit.openedAt)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(visit.id)}
                  disabled={deletingVisitId === visit.id}
                  className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${deletingVisitId === visit.id
                    ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-600'
                    : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40'
                    }`}
                >
                  <Trash2 size={14} />
                  {deletingVisitId === visit.id ? labels.deletingAction : labels.deleteAction}
                </button>
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full table-fixed divide-y divide-gray-200 text-sm dark:divide-slate-700">
            <thead className="bg-gray-50/80 text-gray-600 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="w-48 px-4 py-3 text-start font-semibold">{labels.name}</th>
                <th className="w-48 px-4 py-3 text-start font-semibold">{labels.group}</th>
                <th className="w-48 px-4 py-3 text-center font-semibold">{labels.phone}</th>
                <th className="w-40 px-4 py-3 text-start font-semibold">{labels.status}</th>
                <th className="w-24 px-4 py-3 text-center font-semibold">{labels.language}</th>
                <th className="w-44 px-4 py-3 text-center font-semibold">{labels.openedAt}</th>
                <th className="w-32 px-4 py-3 text-start font-semibold">{labels.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-slate-700 dark:bg-slate-900">
              {visits.map((visit) => {
                const rsvpStatus = rsvpStatusByPhone.get(visit.phone);
                const statusLabel = rsvpStatus === undefined
                  ? labels.pending
                  : rsvpStatus
                    ? labels.attending
                    : labels.notAttending;
                const statusClassName = rsvpStatus === undefined
                  ? 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300'
                  : rsvpStatus
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300';

                return (
                  <tr key={visit.id} className="align-top">
                    <td className="w-48 px-4 py-3 font-medium text-gray-900 dark:text-slate-100">
                      {visit.guestName || labels.unknownName}
                    </td>
                    <td className="w-48 px-4 py-3 text-gray-700 dark:text-slate-300">
                      {visit.guestGroup || labels.unassignedGroup}
                    </td>
                    <td className="w-48 px-4 py-3 text-center text-gray-700 whitespace-nowrap dark:text-slate-300" dir="ltr">
                      {visit.phone}
                    </td>
                    <td className="w-40 px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClassName}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="w-24 px-4 py-3 text-center text-gray-700 dark:text-slate-300" dir="ltr">{visit.lang}</td>
                    <td className="w-44 px-4 py-3 text-center text-gray-700 whitespace-nowrap dark:text-slate-300" dir="ltr">
                      {formatDate(visit.openedAt)}
                    </td>
                    <td className="w-32 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onDelete(visit.id)}
                        disabled={deletingVisitId === visit.id}
                        className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${deletingVisitId === visit.id
                          ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-600'
                          : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40'
                          }`}
                      >
                        <Trash2 size={14} />
                        {deletingVisitId === visit.id ? labels.deletingAction : labels.deleteAction}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      </div>
      )}
    </div>
  );
}
