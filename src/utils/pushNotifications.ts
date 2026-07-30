import { getApp } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { firebaseConfig } from '../config/firebaseConfig';

const NOTIFICATION_TOKENS_COLLECTION = 'adminNotificationTokens';

export type EnableNotificationsResult =
  | { status: 'enabled' }
  | { status: 'unsupported' }
  | { status: 'denied' }
  | { status: 'error'; message: string };

// The service worker can't read Vite's import.meta.env at runtime (it's a
// separate, un-bundled file served as-is from /public), so the same public
// (non-secret) Firebase config values the app already ships to every
// visitor's browser are passed along as query params on the registration
// URL instead - see public/firebase-messaging-sw.js, which reads them back
// out of self.location.search.
function buildServiceWorkerUrl(): string {
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey ?? '',
    authDomain: firebaseConfig.authDomain ?? '',
    projectId: firebaseConfig.projectId ?? '',
    appId: firebaseConfig.appId ?? '',
    messagingSenderId: firebaseConfig.messagingSenderId ?? '',
  });
  return `/firebase-messaging-sw.js?${params.toString()}`;
}

// Walks Gil through turning on push notifications for this browser/device:
// registers the service worker, asks for OS-level notification permission,
// fetches this device's FCM registration token, and saves it to Firestore
// so the notifyOnRsvpWrite Cloud Function (see functions/src/index.ts) knows
// where to send a push whenever a guest submits or edits an RSVP. Safe to
// call more than once (e.g. on a second device) - each device gets its own
// token document.
export async function enableAdminPushNotifications(vapidKey: string): Promise<EnableNotificationsResult> {
  try {
    if (!vapidKey) {
      return { status: 'error', message: 'Missing VAPID key configuration.' };
    }
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      return { status: 'unsupported' };
    }
    if (!(await isSupported())) {
      return { status: 'unsupported' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { status: 'denied' };
    }

    const registration = await navigator.serviceWorker.register(buildServiceWorkerUrl());
    const messaging = getMessaging(getApp());
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });

    if (!token) {
      return { status: 'error', message: 'Could not get a notification token from this browser.' };
    }

    await addDoc(collection(db, NOTIFICATION_TOKENS_COLLECTION), {
      token,
      createdAt: serverTimestamp(),
    });

    return { status: 'enabled' };
  } catch (error) {
    console.error('Failed to enable push notifications', error);
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
