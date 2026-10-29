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
 * Formats a monetary amount with currency symbol and localized digits.
 */
export function formatMoney(
  amount: number | string | Prisma.Decimal,
  locale: string = "en",
  currency?: string
): string {
  const num = typeof amount === "object" && "toNumber" in amount
    ? (amount as Prisma.Decimal).toNumber()
    : Number(amount);

  const formatted = num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const effectiveCurrency = currency || (locale === "bn" ? "BDT" : "USD");
  let symbol = "$";
  if (effectiveCurrency === "BDT") {
    symbol = "৳";
  } else if (effectiveCurrency === "USD") {
    symbol = "$";
  } else if (effectiveCurrency === "EUR") {
    symbol = "€";
  } else if (effectiveCurrency === "GBP") {
    symbol = "£";
  } else if (effectiveCurrency === "INR") {
    symbol = "₹";
  } else if (effectiveCurrency === "AED") {
    symbol = "AED ";
  } else if (effectiveCurrency === "CAD") {
    symbol = "CA$";
  } else if (effectiveCurrency === "AUD") {
    symbol = "A$";
  } else if (effectiveCurrency === "SGD") {
    symbol = "S$";
  } else {
    symbol = `${effectiveCurrency} `;
  }

  if (locale === "bn") {
    return `${symbol}${toBanglaDigits(formatted)}`;
  }
  return `${symbol}${formatted}`;
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
export function formatNumber(value: number | string | Prisma.Decimal, locale: string = "bn"): string {
  const num = typeof value === "object" && "toNumber" in value ? (value as Prisma.Decimal).toNumber() : Number(value);
  if (!Number.isFinite(num)) return String(value);
  const formatted = num.toLocaleString("en-US", { maximumFractionDigits: 3 });
  return locale === "bn" ? toBanglaDigits(formatted) : formatted;
}
