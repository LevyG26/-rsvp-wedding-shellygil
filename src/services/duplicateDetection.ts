import type { GuestRosterEntry } from './guestRoster';
import { entriesLikelyMatch } from './rsvpRosterLink';

// Finds clusters of 2+ entries on one side whose names fuzzy-match each
// other (same logic used everywhere else in this app for name matching).
// This is the recurring cause of guest-count drift: renaming a guest's
// name/category in the sheet gives them a new document ID, so a plain sync
// adds a fresh row instead of updating the old one, leaving an orphan
// behind. Read-only - only ever used to show the admin what to review.
export function findLikelyDuplicateGroups(entries: GuestRosterEntry[], side: string): GuestRosterEntry[][] {
  const sideEntries = entries.filter((entry) => entry.side === side);
  const parent = sideEntries.map((_, index) => index);

  function find(index: number): number {
    let root = index;
    while (parent[root] !== root) {
      root = parent[root];
    }
    let current = index;
    while (parent[current] !== root) {
      const next = parent[current];
      parent[current] = root;
      current = next;
    }
    return root;
  }

  function union(indexA: number, indexB: number): void {
    const rootA = find(indexA);
    const rootB = find(indexB);
    if (rootA !== rootB) parent[rootA] = rootB;
  }

  for (let i = 0; i < sideEntries.length; i += 1) {
    for (let j = i + 1; j < sideEntries.length; j += 1) {
      if (entriesLikelyMatch(sideEntries[i], sideEntries[j])) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, GuestRosterEntry[]>();
  for (let i = 0; i < sideEntries.length; i += 1) {
    const root = find(i);
    const group = groups.get(root) ?? [];
    group.push(sideEntries[i]);
    groups.set(root, group);
  }

  return Array.from(groups.values()).filter((group) => group.length > 1);
}
