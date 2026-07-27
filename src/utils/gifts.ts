// Shared between AdminDashboard.tsx, GiftsSection.tsx (the "כספים" tab UI),
// services/giftEntries.ts and admin/exportGiftsWorkbook.ts - kept as its own
// tiny module so all four places agree on one definition of "how much was
// given, in what, by what method" instead of duplicating the logic.
export type GiftMethod = 'cash' | 'bit_paybox' | 'check';

export const GIFT_METHODS: GiftMethod[] = ['cash', 'bit_paybox', 'check'];

export function isGiftMethod(value: unknown): value is GiftMethod {
  return typeof value === 'string' && (GIFT_METHODS as string[]).includes(value);
}

// Every one of the three payment methods can be given in any of these three
// currencies (a cash gift can be dollars, a check can be euros, etc.) - Bit/
// Paybox is technically ILS-only in real life, but Gil asked for all three
// methods to support all three currencies rather than special-casing one.
export type GiftCurrency = 'ILS' | 'USD' | 'EUR';

export const GIFT_CURRENCIES: GiftCurrency[] = ['ILS', 'USD', 'EUR'];

export function isGiftCurrency(value: unknown): value is GiftCurrency {
  return typeof value === 'string' && (GIFT_CURRENCIES as string[]).includes(value);
}

export const CURRENCY_SYMBOLS: Record<GiftCurrency, string> = { ILS: '₪', USD: '$', EUR: '€' };

export const DEFAULT_GIFT_CURRENCY: GiftCurrency = 'ILS';

// One amount + currency PER METHOD rather than a single amount/currency/
// method - a guest can split their gift across more than one method (e.g.
// 500 in cash + 500 by Bit), and each of those can independently be in a
// different currency.
export interface GiftMethodAmount {
  amount: number | null;
  currency: GiftCurrency;
}

export type GiftAmounts = Record<GiftMethod, GiftMethodAmount>;

export const EMPTY_GIFT_AMOUNTS: GiftAmounts = {
  cash: { amount: null, currency: DEFAULT_GIFT_CURRENCY },
  bit_paybox: { amount: null, currency: DEFAULT_GIFT_CURRENCY },
  check: { amount: null, currency: DEFAULT_GIFT_CURRENCY },
};

export function isEmptyGiftAmounts(amounts: GiftAmounts): boolean {
  return GIFT_METHODS.every((method) => amounts[method].amount === null);
}

// There's no reliable live exchange rate to convert ₪/$/€ into one number,
// so totals are always kept as a per-currency breakdown (e.g. {ILS: 1500,
// USD: 200}) rather than ever being added together across currencies.
export type GiftCurrencyTotals = Partial<Record<GiftCurrency, number>>;

export function addToTotals(totals: GiftCurrencyTotals, currency: GiftCurrency, amount: number): GiftCurrencyTotals {
  return { ...totals, [currency]: (totals[currency] ?? 0) + amount };
}

export function mergeCurrencyTotals(...totalsList: GiftCurrencyTotals[]): GiftCurrencyTotals {
  let merged: GiftCurrencyTotals = {};
  totalsList.forEach((totals) => {
    GIFT_CURRENCIES.forEach((currency) => {
      const value = totals[currency];
      if (value) {
        merged = addToTotals(merged, currency, value);
      }
    });
  });
  return merged;
}

export function sumGiftAmountsByCurrency(amounts: GiftAmounts): GiftCurrencyTotals {
  let totals: GiftCurrencyTotals = {};
  GIFT_METHODS.forEach((method) => {
    const entry = amounts[method];
    if (entry.amount !== null) {
      totals = addToTotals(totals, entry.currency, entry.amount);
    }
  });
  return totals;
}

export function formatCurrencyAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount);
}

// Renders a per-currency breakdown as one compact string, e.g. "₪1,500 +
// $200" - only the currencies that actually have an amount are shown, in a
// fixed ILS/USD/EUR order so it reads consistently guest to guest.
export function formatCurrencyTotals(totals: GiftCurrencyTotals): string {
  const parts = GIFT_CURRENCIES
    .filter((currency) => !!totals[currency])
    .map((currency) => `${CURRENCY_SYMBOLS[currency]}${formatCurrencyAmount(totals[currency] as number)}`);
  return parts.length > 0 ? parts.join(' + ') : `${CURRENCY_SYMBOLS[DEFAULT_GIFT_CURRENCY]}0`;
}
