/** Currencies a supplier can price in (each has a rate in lib/forex.ts). */
export const CURRENCIES = ["USD", "EUR", "GBP", "AED", "SAR", "INR", "BDT", "CNY"] as const;

export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = "USD";

/** A supported upper-case code, or null for anything else. */
export function normalizeCurrency(value: unknown): Currency | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return (CURRENCIES as readonly string[]).includes(code) ? (code as Currency) : null;
}
