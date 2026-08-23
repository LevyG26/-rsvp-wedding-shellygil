// Firestore's write promises (updateDoc/setDoc/runTransaction) only resolve
// once the server acknowledges them - if a phone loses signal or the venue
// WiFi drops mid-edit, that promise can hang indefinitely even though the
// SDK already queued the write locally and will sync it automatically once
// the connection comes back. Left unguarded, any "saving..." spinner that
// simply awaits that promise gets stuck forever with no error and no way
// out for the person using it. Wrapping the awaited call in withTimeout
// gives the UI a way to give up waiting after a few seconds and tell the
// person what's actually happening, without touching the underlying write
// itself (it keeps running/queued regardless of this timeout).
export class SaveTimeoutError extends Error {
  constructor() {
    super('save-timeout');
    this.name = 'SaveTimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SaveTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
