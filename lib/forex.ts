/**
 * lib/forex.ts
 *
 * Forex Exchange Snapshot & Multi-Currency Settlement Engine (§1.2)
 *
 * Implements high-precision forex snapshots for cross-border RFQs and Quotes.
 * Every quote must snapshot base rates to USD, displayed rates to USD, and the
 * resulting cross-rate:
 *
 *   1 Base = (baseRateToUsd / displayedRateToUsd) Displayed
 *   displayedTotalAmount = totalPrice * crossRateSnapshot
 *
 * Stored with Decimal(20, 10) precision for complete mathematical auditability across disputes.
 */

import { findCurrencyByCode } from "@/lib/repo/forex";
import { Prisma } from "@prisma/client";

export const DEFAULT_RATES_TO_USD: Record<string, string> = {
  USD: "1.0000000000",
  EUR: "1.0850000000",
  GBP: "1.2950000000",
  BDT: "0.0083333333", // ~120 BDT per USD
  INR: "0.0119047619", // ~84 INR per USD
  AED: "0.2722940776", // 3.6725 AED per USD
  CNY: "0.1408450704", // 7.10 CNY per USD
  SAR: "0.2666666667", // 3.75 SAR per USD
};

export interface ForexSnapshotInput {
  baseCurrency?: string | null;
  displayedCurrency?: string | null;
  totalPrice: Prisma.Decimal | number | string;
  now?: Date;
}

export interface ForexSnapshotResult {
  baseCurrency: string;
  displayedCurrency: string;
  baseRateToUsd: Prisma.Decimal;
  displayedRateToUsd: Prisma.Decimal;
  crossRateSnapshot: Prisma.Decimal;
  displayedTotalAmount: Prisma.Decimal;
  exchangeRateTimestamp: Date;
}

export async function getRateToUsd(currency: string): Promise<Prisma.Decimal> {
  const code = (currency || "USD").toUpperCase();
  const row = await findCurrencyByCode(code);
  if (row?.rateToUsd) {
    return new Prisma.Decimal(row.rateToUsd);
  }
  const defaultRate = DEFAULT_RATES_TO_USD[code] || "1.0000000000";
  return new Prisma.Decimal(defaultRate);
}

export async function computeForexSnapshot(
  input: ForexSnapshotInput
): Promise<ForexSnapshotResult> {
  const now = input.now || new Date();
  const baseCurrency = (input.baseCurrency || "USD").toUpperCase();
  const displayedCurrency = (input.displayedCurrency || baseCurrency).toUpperCase();

  const baseRateToUsd = await getRateToUsd(baseCurrency);
  const displayedRateToUsd = await getRateToUsd(displayedCurrency);

  // Cross Rate = 1 Base = X Displayed
  // 1 Base in USD = baseRateToUsd. 1 Displayed in USD = displayedRateToUsd.
  // Therefore 1 Base = (baseRateToUsd / displayedRateToUsd) Displayed.
  const crossRateSnapshot = baseRateToUsd
    .div(displayedRateToUsd)
    .toDecimalPlaces(10, Prisma.Decimal.ROUND_HALF_UP);

  const total = new Prisma.Decimal(input.totalPrice);
  const displayedTotalAmount = total
    .mul(crossRateSnapshot)
    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

  return {
    baseCurrency,
    displayedCurrency,
    baseRateToUsd,
    displayedRateToUsd,
    crossRateSnapshot,
    displayedTotalAmount,
    exchangeRateTimestamp: now,
  };
}
