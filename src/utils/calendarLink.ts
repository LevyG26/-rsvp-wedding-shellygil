// Builds an "add to calendar" link that matches the guest's device: Apple
// devices (iPhone/iPad/Mac) get a downloadable .ics file that opens directly
// in their native Calendar app, everyone else gets a Google Calendar web link
// (works from any browser, no app or account requirement to view it).

interface CalendarEventInput {
  title: string;
  location: string;
  description: string;
  /** Compact form, e.g. 20260826T180000 (local wall-clock time, no timezone conversion). */
  startCompact: string;
  endCompact: string;
  timeZone: string;
}

export interface CalendarLink {
  href: string;
  isDownload: boolean;
  fileName?: string;
}

function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Covers real Macs and iPads too - iPadOS reports its UA as "Macintosh" by
  // default (with touch support), which a previous "Mac must have no touch"
  // check here was incorrectly excluding.
  return /iPad|iPhone|iPod|Macintosh/.test(ua);
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function buildIcsHref(event: CalendarEventInput): CalendarLink {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wedding RSVP//HE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `DTSTART;TZID=${event.timeZone}:${event.startCompact}`,
    `DTEND;TZID=${event.timeZone}:${event.endCompact}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `LOCATION:${escapeIcsText(event.location)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  // A Blob object URL (not a data: URI) is what makes the `download`
  // attribute actually reliable in mobile Safari - Safari has always been
  // inconsistent about honoring `download` on data: URIs (that's what made
  // the button silently do nothing), but a real Blob URL downloads properly,
  // after which tapping the downloaded file offers "Add to Calendar".
  const blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' });
  const href = typeof URL !== 'undefined' && 'createObjectURL' in URL
    ? URL.createObjectURL(blob)
    : `data:text/calendar;charset=utf-8,${encodeURIComponent(lines)}`;

  return {
    href,
    isDownload: true,
    fileName: 'wedding.ics',
  };
}

function buildGoogleCalendarHref(event: CalendarEventInput): CalendarLink {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${event.startCompact}/${event.endCompact}`,
    location: event.location,
    details: event.description,
    ctz: event.timeZone,
  });

  return {
    href: `https://calendar.google.com/calendar/render?${params.toString()}`,
    isDownload: false,
  };
}

export function buildCalendarLink(event: CalendarEventInput): CalendarLink {
  return isApplePlatform() ? buildIcsHref(event) : buildGoogleCalendarHref(event);
}
