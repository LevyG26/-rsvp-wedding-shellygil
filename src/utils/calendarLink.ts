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
  const isIOs = /iPad|iPhone|iPod/.test(ua);
  const isMac = /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document === false;
  return isIOs || isMac;
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

  return {
    href: `data:text/calendar;charset=utf-8,${encodeURIComponent(lines)}`,
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
