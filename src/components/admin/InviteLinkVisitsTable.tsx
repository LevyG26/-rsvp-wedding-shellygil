import { RefreshCcw, Trash2 } from 'lucide-react';

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
  enrichAction: string;
  enrichingAction: string;
}

interface InviteLinkVisitsTableProps {
  visits: InviteLinkVisitRecord[];
  rsvpStatusByPhone: Map<string, boolean>;
  labels: InviteLinkVisitsTableLabels;
  formatDate: (value: Date | null) => string;
  isLoading: boolean;
  isEnriching: boolean;
  deletingVisitId: string | null;
  onDelete: (visitId: string) => void;
  onEnrich: () => void;
}

export function InviteLinkVisitsTable({
  visits,
  rsvpStatusByPhone,
  labels,
  formatDate,
  isLoading,
  isEnriching,
  deletingVisitId,
  onDelete,
  onEnrich,
}: InviteLinkVisitsTableProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 shadow-xl backdrop-blur-md">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{labels.title}</h2>
          <p className="mt-1 text-sm text-gray-500">{labels.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onEnrich}
          disabled={isLoading || isEnriching || visits.length === 0}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
            isLoading || isEnriching || visits.length === 0
              ? 'cursor-not-allowed bg-gray-100 text-gray-400'
              : 'bg-gray-900 text-white hover:bg-gray-800'
          }`}
        >
          <RefreshCcw size={14} className={isEnriching ? 'animate-spin' : ''} />
          {isEnriching ? labels.enrichingAction : labels.enrichAction}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 p-8 text-gray-600">
          <span className="h-5 w-5 rounded-full border-2 border-gray-200 border-t-gray-700 animate-spin" />
          <span>{labels.loading}</span>
        </div>
      ) : visits.length === 0 ? (
        <div className="p-8 text-center text-gray-600">{labels.noRecords}</div>
      ) : (
        <>
        {/* Mobile card list */}
        <div className="divide-y divide-gray-100 md:hidden">
          {visits.map((visit) => {
            const rsvpStatus = rsvpStatusByPhone.get(visit.phone);
            const statusLabel = rsvpStatus === undefined
              ? labels.pending
              : rsvpStatus
                ? labels.attending
                : labels.notAttending;
            const statusClassName = rsvpStatus === undefined
              ? 'bg-gray-100 text-gray-700'
              : rsvpStatus
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-700';

            return (
              <div key={visit.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{visit.guestName || labels.unknownName}</p>
                    <p className="text-xs text-gray-500">{visit.guestGroup || labels.unassignedGroup}</p>
                    <p className="text-xs text-gray-500" dir="ltr">{visit.phone}</p>
                  </div>
                  <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusClassName}`}>
                    {statusLabel}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span dir="ltr">{visit.lang.toUpperCase()}</span>
                  <span dir="ltr">{formatDate(visit.openedAt)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(visit.id)}
                  disabled={deletingVisitId === visit.id}
                  className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${deletingVisitId === visit.id
                    ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                    : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
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
          <table className="min-w-full table-fixed divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50/80 text-gray-600">
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
            <tbody className="divide-y divide-gray-100 bg-white">
              {visits.map((visit) => {
                const rsvpStatus = rsvpStatusByPhone.get(visit.phone);
                const statusLabel = rsvpStatus === undefined
                  ? labels.pending
                  : rsvpStatus
                    ? labels.attending
                    : labels.notAttending;
                const statusClassName = rsvpStatus === undefined
                  ? 'bg-gray-100 text-gray-700'
                  : rsvpStatus
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700';

                return (
                  <tr key={visit.id} className="align-top">
                    <td className="w-48 px-4 py-3 font-medium text-gray-900">
                      {visit.guestName || labels.unknownName}
                    </td>
                    <td className="w-48 px-4 py-3 text-gray-700">
                      {visit.guestGroup || labels.unassignedGroup}
                    </td>
                    <td className="w-48 px-4 py-3 text-center text-gray-700 whitespace-nowrap" dir="ltr">
                      {visit.phone}
                    </td>
                    <td className="w-40 px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClassName}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="w-24 px-4 py-3 text-center text-gray-700" dir="ltr">{visit.lang}</td>
                    <td className="w-44 px-4 py-3 text-center text-gray-700 whitespace-nowrap" dir="ltr">
                      {formatDate(visit.openedAt)}
                    </td>
                    <td className="w-32 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onDelete(visit.id)}
                        disabled={deletingVisitId === visit.id}
                        className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${deletingVisitId === visit.id
                          ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                          : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
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
  );
}
