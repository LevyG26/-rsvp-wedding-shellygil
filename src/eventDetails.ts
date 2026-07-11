// Hardcoded on purpose (not read from Vercel Environment Variables): this is
// public, non-sensitive event info, and depending on environment variables
// meant every date/time correction required editing them by hand in the
// Vercel dashboard *and* remembering to hit Redeploy afterwards - a step that
// kept getting missed, leaving the live site showing a stale time. Committing
// the real values directly here means a normal `git push` is enough on its
// own to ship a correction, same as any other code change.
export const EVENT_START_ISO = '2026-08-26T18:00:00';
export const EVENT_CALENDAR_START = '20260826T180000';
export const EVENT_CALENDAR_END = '20260826T230000';
export const EVENT_TIME_ZONE = 'Asia/Jerusalem';
