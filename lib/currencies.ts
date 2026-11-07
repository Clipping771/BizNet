/** Currencies a supplier can price in (each has a rate in lib/forex.ts). The pilot market's comes first. */
export const CURRENCIES = ["BDT", "USD", "EUR", "GBP", "INR", "AED", "SAR", "CNY"] as const;

export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = "BDT";

/** A supported upper-case code, or null for anything else. */
export function normalizeCurrency(value: unknown): Currency | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return (CURRENCIES as readonly string[]).includes(code) ? (code as Currency) : null;
}
