import { type GuestRosterEntry, type GuestRosterEntryInput, updateGuestRosterEntry } from './guestRoster';

// Minimal shape the linker needs from an RSVP record - kept independent from
// AdminDashboard's own RSVPRecord type so this module has no import cycle.
export interface LinkableRsvp {
  fullName: string;
  isAttending: boolean;
  guestsCount: number;
  // Admin-picked roster entry id, set from the responses table when the
  // automatic name match came back empty ("no match") or ambiguous ("several
  // matches") and a human confirms which one is actually correct. Always
  // wins over the automatic name matching below when present and still
  // valid (the entry hasn't since been deleted).
  manualRosterEntryId?: string | null;
}

export interface RosterLinkResult {
  // Roster entries whose knownResponse/invitedCount were changed by a match.
  updatedCount: number;
  // Roster entries that matched an RSVP but were already up to date.
  matchedNoChangeCount: number;
  // RSVP full names that matched more than one roster entry - skipped, since
  // guessing wrong would silently mark the wrong person as attending.
  ambiguousCount: number;
  // Roster entries that had been auto-linked to an RSVP that no longer
  // exists (deleted, or edited enough to stop matching) and were reverted
  // back to "not yet responded".
  revertedCount: number;
}

// Strips Hebrew niqqud/cantillation marks, Latin accents (é/è/ë -> e, so
// "Élisa"/"Stéphane" line up with unaccented spellings), quotes, and
// punctuation, then lowercases. Also turns "&" and "-" into a plain space
// (a word separator) rather than deleting them outright - a hyphenated
// compound name like "מי-טל" needs to tokenize the same as "מי טל", since a
// guest filling in the RSVP form will often type the space version even
// though the roster has it hyphenated (or vice versa). Deleting the hyphen
// instead (the old behavior) fused it into one token "מיטל" that could
// never match a name typed as two separate words - that's what caused a
// genuine roster entry to show up as "no match" for "מי טל נוימן".
const HEBREW_NIQQUD_PATTERN = new RegExp('[\\u0591-\\u05C7]', 'g');
const LATIN_COMBINING_ACCENT_PATTERN = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizeNameToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(HEBREW_NIQQUD_PATTERN, '') // Hebrew niqqud/cantillation
    .replace(LATIN_COMBINING_ACCENT_PATTERN, '') // Latin combining accents, e.g. Élisa -> Elisa
    .replace(/["'׳״.,]/g, '')
    .replace(/[-&]/g, ' ')
    .toLowerCase()
    .trim();
}

// Pure connector words that carry no identifying info on their own - "and"
// in French/English/Hebrew. Dropped so they never block a match the way a
// real, unmatched name token should.
const CONNECTOR_WORDS = new Set(['et', 'and']);

function tokenize(fullName: string): string[] {
  return normalizeNameToken(fullName)
    .split(/\s+/)
    .filter((token) => token.length > 0 && !CONNECTOR_WORDS.has(token));
}

// Drops a single leading Hebrew "ו" (and) conjunction, if any - e.g. "ואיציק"
// -> "איציק". Used only for comparing two tokens, never to alter what gets
// displayed, so a name that's genuinely "ו"-initial (e.g. "ולרי"/Valery)
// still matches itself fine when compared unstripped.
function stripLeadingVav(token: string): string {
  return token.length > 2 && token[0] === 'ו' ? token.slice(1) : token;
}

// Hebrew often spells the same name two ways depending on whether a vowel
// letter (ו/י) is written out ("מלא") or left out ("חסר") - e.g. "סתיו" vs
// "סתו". True if `longer` becomes `shorter` by deleting exactly one ו or י
// (never any other letter), so this only ever catches that specific,
// well-known spelling variation - not arbitrary typos.
function isVowelLetterSpellingVariant(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) !== 1) return false;
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];

  for (let i = 0; i < longer.length; i += 1) {
    if (longer[i] !== 'ו' && longer[i] !== 'י') continue;
    if (longer.slice(0, i) + longer.slice(i + 1) === shorter) return true;
  }

  return false;
}

// True if both tokens are the same length (>= 4, so short/common names are
// never affected) and differ in exactly one letter position - e.g. "אירית"
// vs "עirית". Deliberately conservative: only one substitution, same length,
// never applied to short tokens, to keep false-match risk low.
function isSingleLetterSubstitution(a: string, b: string): boolean {
  if (a.length !== b.length || a.length < 4) return false;
  let diffCount = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      diffCount += 1;
      if (diffCount > 1) return false;
    }
  }
  return diffCount === 1;
}

// General, script-agnostic version of the same idea: true if one token
// becomes the other by inserting or deleting exactly one character anywhere
// (e.g. "michele" -> "michelle", "joanna" -> "johanna"). Only applied to
// tokens of length >= 4 to keep short/common names exact-only.
function isSingleLetterInsertionOrDeletion(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) !== 1) return false;
  if (Math.min(a.length, b.length) < 4) return false;

  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;

  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }

    if (skipped) return false;
    skipped = true;
    longIndex += 1;
  }

  return true;
}

// Two tokens are considered the same word if they're identical, become
// identical once a leading "ו" is dropped from either side (covers
// couples/families written as "X ו-Y" where different sources attach the
// conjunction to different people, e.g. "אירית ואיציק" vs "איציק ועירית"),
// differ only by one מלא/חסר vowel letter, one substituted letter, or one
// inserted/deleted letter in an otherwise-identical, reasonably long name.
// These can combine (e.g. a leading "ו" AND a one-letter spelling
// difference at once, like "אירית" vs "ועירית"), so every check runs
// against both the raw tokens and
// the vav-stripped versions.
function tokensEqual(a: string, b: string): boolean {
  const strippedA = stripLeadingVav(a);
  const strippedB = stripLeadingVav(b);
  const pairs: Array<[string, string]> = [[a, b], [strippedA, b], [a, strippedB], [strippedA, strippedB]];

  return pairs.some(
    ([x, y]) =>
      x === y ||
      isVowelLetterSpellingVariant(x, y) ||
      isSingleLetterSubstitution(x, y) ||
      isSingleLetterInsertionOrDeletion(x, y),
  );
}

// True if every token in `shorter` can be paired with its own DISTINCT token
// in `longer` (no two shorter tokens allowed to both claim the same longer
// token). Without this, two unrelated short tokens that each loosely
// resemble the same single word would wrongly look like a full match - e.g.
// "מיקי" and "מאירי" both loosely resemble "מירי", which would otherwise
// make "מיקי מאירי" look like it matches "מירי נגר" (two different people).
function hasBijectiveTokenMatch(shorter: string[], longer: string[]): boolean {
  const usedIndexes = new Set<number>();

  function tryMatch(index: number): boolean {
    if (index === shorter.length) return true;

    for (let i = 0; i < longer.length; i += 1) {
      if (usedIndexes.has(i) || !tokensEqual(shorter[index], longer[i])) continue;
      usedIndexes.add(i);
      if (tryMatch(index + 1)) return true;
      usedIndexes.delete(i);
    }

    return false;
  }

  return tryMatch(0);
}

// Order-independent: every token of the shorter name must appear among the
// longer name's tokens, so "Gil Levy" matches both "Levy Gil" and roster
// entries split across firstName/lastName in either order.
function namesMatch(tokensA: string[], tokensB: string[]): boolean {
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  return hasBijectiveTokenMatch(shorter, longer);
}

export function findRosterMatches(rsvpFullName: string, entries: GuestRosterEntry[]): GuestRosterEntry[] {
  const rsvpTokens = tokenize(rsvpFullName);
  if (rsvpTokens.length === 0) return [];
  return entries.filter((entry) => namesMatch(rsvpTokens, tokenize(`${entry.firstName} ${entry.lastName}`)));
}

// Same result shape as findRosterMatches, but checks a manual admin override
// first - used everywhere a response needs to be resolved to a roster entry
// (the responses table's display column, and the auto-linker below), so a
// human's explicit pick for a "no match"/"ambiguous" case is honored
// consistently everywhere instead of just in one place. Falls back to the
// normal name matching if there's no override, or if the picked entry no
// longer exists (e.g. it was since deleted from the roster).
export function resolveRosterMatches(rsvp: LinkableRsvp, entries: GuestRosterEntry[]): GuestRosterEntry[] {
  if (rsvp.manualRosterEntryId) {
    const pickedEntry = entries.find((entry) => entry.id === rsvp.manualRosterEntryId);
    if (pickedEntry) return [pickedEntry];
  }
  return findRosterMatches(rsvp.fullName, entries);
}

// True if two roster entries' names fuzzy-match each other using the same
// tolerant comparison as findRosterMatches - e.g. catches "ספיר ויותם מרי"
// vs "ספיר ויותם מאירי" left behind after a rename in the sheet created a
// fresh document instead of updating the old one. Used only to flag likely
// duplicate rows for a human to review and delete - never deletes anything
// itself.
export function entriesLikelyMatch(a: GuestRosterEntry, b: GuestRosterEntry): boolean {
  return namesMatch(tokenize(`${a.firstName} ${a.lastName}`), tokenize(`${b.firstName} ${b.lastName}`));
}

// --- Couple/family names split across multiple roster rows ---
//
// Some sides record each guest as their own row even when a source lists a
// couple together, e.g. "Swann & Sharone Sidoun" needs to match two separate
// rows: "Swann Sidoun" and "Sharone Sidoun". Splits on "&"/"et" and, for any
// segment that's just a first name (no surname of its own), borrows the
// surname from the last segment. Requires every segment to match someone -
// used only for the same low-stakes "explain away" purpose as the
// cross-script matching above, never for anything that writes data.
function splitCoupleSegments(fullName: string): string[] {
  return fullName
    .split(/\s*(?:&|\bet\b)\s*/i)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function findCoupleRosterMatches(fullName: string, entries: GuestRosterEntry[]): GuestRosterEntry[] {
  const segments = splitCoupleSegments(fullName);
  if (segments.length < 2) return [];

  const lastSegmentWords = segments[segments.length - 1].split(/\s+/).filter(Boolean);
  if (lastSegmentWords.length < 2) return [];
  const inferredSurname = lastSegmentWords[lastSegmentWords.length - 1];

  const allMatches: GuestRosterEntry[] = [];

  for (const segment of segments) {
    const words = segment.split(/\s+/).filter(Boolean);
    const candidateName = words.length > 1 ? segment : `${segment} ${inferredSurname}`;
    const matches = findRosterMatches(candidateName, entries);
    if (matches.length === 0) return [];
    allMatches.push(...matches);
  }

  return allMatches;
}

// --- Cross-script (Hebrew <-> Latin) matching ---
//
// Used ONLY to recognize that a Hebrew name and a Latin-spelled roster entry
// are likely the same person (e.g. "דוד גולן" / "David Golan"), for display
// purposes such as explaining away a name that already exists on a different
// side. This is deliberately looser than the same-script matching above -
// false positives here only hide a name from a review list, they never
// change any RSVP status - so it's not used anywhere writes happen.
const HEBREW_CONSONANT_MAP: Record<string, string> = {
  'א': '', 'ע': '', 'ה': '',
  'ב': 'b', 'ג': 'g', 'ד': 'd', 'ז': 'z', 'ח': 'h', 'ט': 't',
  'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n',
  'ס': 's', 'פ': 'p', 'ף': 'f', 'צ': 'ts', 'ץ': 'ts',
  'ק': 'k', 'ר': 'r', 'ש': 's', 'ת': 't',
};

// ו and י are ambiguous - each can be a consonant (v/y) or just a vowel
// sound - so every occurrence branches into both possibilities and this
// returns every resulting candidate spelling.
function hebrewTokenToLatinSkeletons(token: string): string[] {
  let skeletons = [''];
  for (const char of token) {
    if (char === 'ו') {
      skeletons = skeletons.flatMap((skeleton) => [`${skeleton}v`, skeleton]);
    } else if (char === 'י') {
      skeletons = skeletons.flatMap((skeleton) => [`${skeleton}y`, skeleton]);
    } else {
      const mapped = HEBREW_CONSONANT_MAP[char] ?? char;
      skeletons = skeletons.map((skeleton) => skeleton + mapped);
    }
  }
  return Array.from(new Set(skeletons));
}

function latinTokenToSkeleton(token: string): string {
  return token.toLowerCase().replace(/[^a-z]/g, '').replace(/[aeiou]/g, '');
}

function looksLikeTransliteration(hebrewToken: string, latinToken: string): boolean {
  if (!/[א-ת]/.test(hebrewToken) || !/^[a-z]+$/i.test(latinToken)) return false;
  const latinSkeleton = latinTokenToSkeleton(latinToken);
  if (latinSkeleton.length < 2) return false;
  return hebrewTokenToLatinSkeletons(hebrewToken).includes(latinSkeleton);
}

// Every Hebrew token must transliterate to some token on the Latin side
// (order-independent) - mirrors namesMatch's subset logic, but across
// scripts.
function crossScriptNamesMatch(hebrewTokens: string[], latinTokens: string[]): boolean {
  if (hebrewTokens.length === 0 || latinTokens.length === 0) return false;
  return hebrewTokens.every((hebrewToken) => latinTokens.some((latinToken) => looksLikeTransliteration(hebrewToken, latinToken)));
}

export function findCrossScriptRosterMatches(hebrewFullName: string, entries: GuestRosterEntry[]): GuestRosterEntry[] {
  const hebrewTokens = tokenize(hebrewFullName).filter((token) => /[א-ת]/.test(token));
  if (hebrewTokens.length === 0) return [];
  return entries.filter((entry) => crossScriptNamesMatch(hebrewTokens, tokenize(`${entry.firstName} ${entry.lastName}`)));
}

// For every submitted RSVP, finds the single matching roster entry (by name)
// and updates its knownResponse (yes/no) and invitedCount (set to the
// confirmed guestsCount when attending, since that's the more accurate,
// up-to-date headcount). Entries with no match, or more than one match, are
// left untouched and counted separately so the admin can review them.
export async function linkGuestRosterWithRsvps(
  entries: GuestRosterEntry[],
  rsvps: LinkableRsvp[],
): Promise<RosterLinkResult> {
  let updatedCount = 0;
  let matchedNoChangeCount = 0;
  let ambiguousCount = 0;
  let revertedCount = 0;

  // Tracks which entries still have a current RSVP match this run, so the
  // revert pass below only touches entries that truly lost theirs.
  const stillMatchedEntryIds = new Set<string>();

  for (const rsvp of rsvps) {
    if (!rsvp.fullName.trim()) continue;

    const matches = resolveRosterMatches(rsvp, entries);
    if (matches.length === 0) continue;
    if (matches.length > 1) {
      ambiguousCount += 1;
      continue;
    }

    const entry = matches[0];
    stillMatchedEntryIds.add(entry.id);

    const desiredKnownResponse = rsvp.isAttending ? 'yes' : 'no';
    const desiredInvitedCount = rsvp.isAttending && rsvp.guestsCount > 0 ? rsvp.guestsCount : entry.invitedCount;

    if (entry.knownResponse === desiredKnownResponse && entry.invitedCount === desiredInvitedCount && entry.linkedFromRsvp) {
      matchedNoChangeCount += 1;
      continue;
    }

    const input: GuestRosterEntryInput = {
      side: entry.side,
      category: entry.category,
      firstName: entry.firstName,
      lastName: entry.lastName,
      invitedCount: desiredInvitedCount,
      knownResponse: desiredKnownResponse,
      linkedFromRsvp: true,
      // Only capture the pre-link count the first time this entry gets
      // linked - a later re-run (e.g. the guest changing their headcount)
      // must not overwrite it with a value that's already post-link.
      preLinkInvitedCount: entry.linkedFromRsvp ? entry.preLinkInvitedCount : entry.invitedCount,
    };

    await updateGuestRosterEntry(entry.id, input);
    updatedCount += 1;
  }

  // Any entry that was previously auto-linked from an RSVP but no longer
  // matches any CURRENT RSVP (the RSVP was deleted, or edited enough to stop
  // matching) reverts back to "not yet responded" with its pre-link planned
  // count restored - so deleting a test/duplicate RSVP actually cleans up
  // the roster status it created, instead of leaving a stale "confirmed"
  // behind forever. Entries whose knownResponse came from the guest sheet or
  // a manual edit (linkedFromRsvp is false) are never touched here.
  for (const entry of entries) {
    if (!entry.linkedFromRsvp || stillMatchedEntryIds.has(entry.id)) continue;

    const input: GuestRosterEntryInput = {
      side: entry.side,
      category: entry.category,
      firstName: entry.firstName,
      lastName: entry.lastName,
      invitedCount: entry.preLinkInvitedCount ?? entry.invitedCount,
      knownResponse: null,
      linkedFromRsvp: false,
      preLinkInvitedCount: null,
    };

    await updateGuestRosterEntry(entry.id, input);
    revertedCount += 1;
  }

  return { updatedCount, matchedNoChangeCount, ambiguousCount, revertedCount };
}
