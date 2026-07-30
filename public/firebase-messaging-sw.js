/* eslint-disable no-undef */
// Background push handler - runs in its own service-worker thread, separate
// from the React app, so it can show a notification even when the dashboard
// tab isn't open or isn't focused. Firebase's compat SDK is loaded via
// importScripts because service workers can't use the app's normal Vite/ESM
// bundle - this file is served as-is from /public, untouched by the build.
//
// The Firebase config values below are NOT hardcoded: a service worker has
// no access to the page's JS variables or import.meta.env, so
// src/utils/pushNotifications.ts passes them along as query-string params
// when it registers this file (see buildServiceWorkerUrl there). These are
// all public, non-secret values already shipped to every visitor's browser
// in the normal app bundle - nothing sensitive is exposed by this.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);

firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  appId: params.get('appId'),
  messagingSenderId: params.get('messagingSenderId'),
});

const messaging = firebase.messaging();

// The notifyOnRsvpWrite Cloud Function (functions/src/index.ts) sends a
// "notification" payload, which most browsers already show automatically -
// this handler mainly exists so the notification click brings the dashboard
// tab into focus (or opens a new one) instead of doing nothing.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'עדכון אישור הגעה';
  const body = payload.notification?.body || '';
  self.registration.showNotification(title, {
    body,
    icon: '/pwa-icon.png',
    badge: '/pwa-icon.png',
    data: { url: payload.data?.url || '/' },
  });
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
