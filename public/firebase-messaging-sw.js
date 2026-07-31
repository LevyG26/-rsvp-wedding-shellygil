/* eslint-disable no-undef */
// Background push handler - runs in its own service-worker thread, separate
// from the React app, so it can show a notification even when the dashboard
// tab isn't open or isn't focused.
//
// This deliberately does NOT use firebase-messaging-compat.js's own
// onBackgroundMessage() helper anymore. That worked fine on Chrome/desktop,
// but on an installed iOS Safari PWA it was unreliable: the handler fired,
// but the parsed payload came back empty, so every notification silently
// fell back to generic placeholder text instead of the real guest name/
// status. Multiple other people hit the same iOS-specific gap in Firebase's
// SDK. Listening to the raw, standard `push` event ourselves and parsing
// the JSON payload directly sidesteps that SDK layer entirely and works
// consistently on both Chrome and iOS Safari - it's plain Web Push API,
// nothing Firebase-specific about it.
//
// api/notify-rsvp.ts (a Vercel serverless function, not a Firebase Cloud
// Function) sends a data-only FCM payload - deliberately no top-level
// `notification` field, since including one caused the browser to
// auto-display a notification AND this handler to show a second one for
// the same push (every RSVP briefly showed twice).
// Makes a newly-deployed version of this file take over immediately (as
// soon as the browser re-fetches it) instead of waiting for every tab/PWA
// instance to be fully closed first - without this, a phone that's already
// enabled notifications can keep running an old, stale copy of this exact
// file for a long time after a fix is deployed, which is what made the last
// couple of fixes look like they hadn't worked.
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = {};
  }

  const data = payload.data || {};
  const title = data.title || 'עדכון אישור הגעה';
  const body = data.body || '';
  const url = data.url || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-icon.png',
      badge: '/pwa-icon.png',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
