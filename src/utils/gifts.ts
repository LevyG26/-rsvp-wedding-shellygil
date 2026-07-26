// Shared between AdminDashboard.tsx (owns the actual rsvps/{id}.giftAmount +
// giftMethod fields) and GiftsSection.tsx (the "כספים" tab UI) - kept as its
// own tiny module rather than defined in either file, since AdminDashboard
// renders GiftsSection and a type defined inside AdminDashboard.tsx would
// mean GiftsSection importing back from the page that imports it.
export type GiftMethod = 'cash' | 'bit_paybox' | 'check';

export const GIFT_METHODS: GiftMethod[] = ['cash', 'bit_paybox', 'check'];

export function isGiftMethod(value: unknown): value is GiftMethod {
  return typeof value === 'string' && (GIFT_METHODS as string[]).includes(value);
}
