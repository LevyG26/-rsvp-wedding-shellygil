import type { FirebaseOptions } from 'firebase/app';

const REQUIRED_FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

type RequiredFirebaseEnvKey = (typeof REQUIRED_FIREBASE_ENV_KEYS)[number];

function readRequiredEnv(key: RequiredFirebaseEnvKey): string {
  const value = import.meta.env[key];

  if (!value) {
    throw new Error(`Missing required Firebase environment variable: ${key}`);
  }

  return value;
}

function readOptionalEnv(key: keyof ImportMetaEnv): string | undefined {
  return import.meta.env[key] || undefined;
}

// Sensitive Firebase project values belong in .env.local, never directly in source.
export const firebaseConfig: FirebaseOptions = {
  apiKey: readRequiredEnv('VITE_FIREBASE_API_KEY'),
  authDomain: readRequiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: readRequiredEnv('VITE_FIREBASE_PROJECT_ID'),
  appId: readRequiredEnv('VITE_FIREBASE_APP_ID'),
  storageBucket: readOptionalEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readOptionalEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  measurementId: readOptionalEnv('VITE_FIREBASE_MEASUREMENT_ID'),
};

export const firestoreDatabaseId = readOptionalEnv('VITE_FIRESTORE_DATABASE_ID');
