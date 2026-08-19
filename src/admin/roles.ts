// Second-tier login for people helping run seating on the day of the event -
// deliberately far more limited than the main admin allowlist in
// firestore.rules' isAdmin(): full access to the Seating tab (tables,
// groups, assignments, alerts, the layout lock) plus read-only lookup of the
// full guest roster (so they can check whether a surprise walk-in actually
// confirmed), and nothing else - no RSVP responses, reminders, or gift
// tracking.
//
// This file only controls what the DASHBOARD UI SHOWS. The real security
// boundary is firestore.rules' own isEventStaff() function - it must list
// the exact same UID(s) as below, or a staff login would still be blocked
// server-side even if the UI tried to show them something. Keep the two in
// sync by hand whenever this list changes.
//
// To add a staff login: Gil creates a new user in Firebase Console ->
// Authentication -> Users -> Add user (a plain email+password works fine,
// e.g. one shared login for whoever is helping with seating that day),
// copies that user's UID from the Users table, and adds it to BOTH this
// array and firestore.rules' isEventStaff().
export const EVENT_STAFF_UIDS: string[] = [
  // 'PASTE-THE-STAFF-USER-UID-HERE',
];

export function isEventStaffUid(uid: string | null): boolean {
  return uid !== null && EVENT_STAFF_UIDS.includes(uid);
}
