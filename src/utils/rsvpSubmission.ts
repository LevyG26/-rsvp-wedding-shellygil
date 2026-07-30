// Remembers a guest's own RSVP submission in THIS browser (localStorage),
// so if they come back to the same invite link later they see their
// previous answer and can correct it in place, instead of unknowingly
// filling the form again and creating a second, duplicate rsvps document.
// This only ever works on the same device/browser they originally submitted
// from - there's no server-side account system here, on purpose (guests
// never log in) - so it's a convenience for the common case (the same
// person reopening the same link), not a guarantee.
export interface StoredRsvpSubmission {
  id: string;
  fullName: string;
  isAttending: boolean;
  guestsCount: number;
  phone?: string;
}

const STORAGE_KEY_PREFIX = 'wedding-rsvp-submission:';

// Scoped per phone (from a personalized /link/{phone} URL) rather than one
// single global key - a shared family device might be used to open more
// than one person's personal link, and each should remember its own answer
// independently. Guests on the general (no-phone) link all share one slot,
// which matches how that link has no per-guest identity to begin with.
function storageKey(scopeKey: string): string {
  return `${STORAGE_KEY_PREFIX}${scopeKey || 'general'}`;
}

export function loadRsvpSubmission(scopeKey: string): StoredRsvpSubmission | null {
  try {
    const raw = window.localStorage.getItem(storageKey(scopeKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.fullName === 'string' &&
      typeof parsed.isAttending === 'boolean' &&
      typeof parsed.guestsCount === 'number'
    ) {
      return {
        id: parsed.id,
        fullName: parsed.fullName,
        isAttending: parsed.isAttending,
        guestsCount: parsed.guestsCount,
        phone: typeof parsed.phone === 'string' ? parsed.phone : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveRsvpSubmission(scopeKey: string, submission: StoredRsvpSubmission): void {
  try {
    window.localStorage.setItem(storageKey(scopeKey), JSON.stringify(submission));
  } catch {
    // Not critical if this fails (e.g. private browsing, storage full) -
    // the RSVP itself already saved to Firestore either way; the guest just
    // won't see their answer pre-filled if they come back later.
  }
}
