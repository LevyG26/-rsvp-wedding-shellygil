import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase';

/**
 * Real admin authentication backed by Firebase Authentication (Email/Password).
 *
 * This replaces the old client-side gate that compared against a
 * VITE_ADMIN_USERNAME / VITE_ADMIN_PASSWORD baked into the public JS bundle.
 * The sign-in itself is verified by Firebase's servers, and the Firestore
 * security rules independently check `request.auth.uid` against an admin
 * allowlist - so access is enforced even if someone bypasses this UI and
 * calls Firestore directly.
 */

export async function loginAsAdmin(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function logoutAdmin(): Promise<void> {
  await signOut(auth);
}

/**
 * Subscribes to the Firebase Auth state. Calls `callback(null)` while signed
 * out and `callback(user)` once signed in. Returns an unsubscribe function.
 */
export function onAdminAuthStateChanged(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}
