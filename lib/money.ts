import { Prisma } from "@prisma/client";

/**
 * Converts Latin digits in a string or number to Bengali digits.
 */
export function toBanglaDigits(num: number | string): string {
  const str = String(num);
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return str.replace(/\d/g, d => bnDigits[Number(d)]);
}

/**
 * Formats a monetary amount with its currency symbol and the viewer's digits.
 * The currency belongs to the record (quotes, listings and orders store one); the viewer's
 * language never changes it. Records without a currency were priced in the database
 * default, BDT.
 */
/** Currency of amounts saved without one (the `currency` column default in the schema). */
export const STORED_DEFAULT_CURRENCY = "USD";

export function formatMoney(
  amount: number | string | Prisma.Decimal,
  locale: string = "en",
  currency?: string
): string {
  const num = typeof amount === "object" && "toNumber" in amount
    ? (amount as Prisma.Decimal).toNumber()
    : Number(amount);

  if (!Number.isFinite(num)) return "0.00";

  const effectiveCurrency = (currency || STORED_DEFAULT_CURRENCY).toUpperCase();

  try {
    const intlLocale = locale === "bn" ? "bn-BD" : locale === "ar" ? "ar-SA" : locale || "en-US";
    return new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: effectiveCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    const formatted = num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${effectiveCurrency} ${formatted}`;
  }
}

/**
 * Calculates total price with strict decimal arithmetic and half-up rounding.
 * totalPrice = unitPrice * quantity + deliveryCharge
 */
export function calculateQuoteTotal(
  unitPrice: number | string | Prisma.Decimal,
  quantity: number | string | Prisma.Decimal,
  deliveryCharge: number | string | Prisma.Decimal = 0
): Prisma.Decimal {
  const priceDec = new Prisma.Decimal(unitPrice);
  const qtyDec = new Prisma.Decimal(quantity);
  const deliveryDec = new Prisma.Decimal(deliveryCharge);

  return priceDec.mul(qtyDec).add(deliveryDec).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Plain number (quantity, count, days) with Bangla digits for bn (§11: ৳১,২৫০ style). */
export function formatNumber(value: number | string | Prisma.Decimal, locale: string = "en"): string {
  const num = typeof value === "object" && "toNumber" in value ? (value as Prisma.Decimal).toNumber() : Number(value);
  if (!Number.isFinite(num)) return String(value);
  const formatted = num.toLocaleString("en-US", { maximumFractionDigits: 3 });
  return locale === "bn" ? toBanglaDigits(formatted) : formatted;
}
