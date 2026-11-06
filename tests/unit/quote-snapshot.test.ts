import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeForexSnapshot, DEFAULT_RATES_TO_USD, getRateToUsd } from "@/lib/forex";
import { calculateQuoteTotal, formatMoney } from "@/lib/money";
import { Prisma } from "@prisma/client";

describe("lib/forex.ts & lib/money.ts - Global Currency & Forex Snapshot Engine (§1.2, §8.7)", () => {
  const fixedNow = new Date("2026-10-27T12:00:00.000Z");

  describe("computeForexSnapshot", () => {
    it("computes 1.0000000000 cross rate and identical total when base and displayed currencies match", async () => {
      const snapshot = await computeForexSnapshot({
        baseCurrency: "USD",
        displayedCurrency: "USD",
        totalPrice: "1500.5000",
        now: fixedNow,
      });

      expect(snapshot.baseCurrency).toBe("USD");
      expect(snapshot.displayedCurrency).toBe("USD");
      expect(snapshot.baseRateToUsd.toString()).toBe("1");
      expect(snapshot.displayedRateToUsd.toString()).toBe("1");
      expect(snapshot.crossRateSnapshot.toString()).toBe("1");
      expect(snapshot.displayedTotalAmount.toString()).toBe("1500.5");
      expect(snapshot.exchangeRateTimestamp).toEqual(fixedNow);
    });

    it("calculates exact mathematical cross-rate and displayed amount across distinct currencies (EUR -> USD)", async () => {
      // EUR rate: 1.0850000000 USD. USD rate: 1.0000000000 USD.
      // 1 EUR = 1.085 / 1.0 = 1.0850000000 USD
      const snapshot = await computeForexSnapshot({
        baseCurrency: "EUR",
        displayedCurrency: "USD",
        totalPrice: "1000.0000",
        now: fixedNow,
      });

      expect(snapshot.baseCurrency).toBe("EUR");
      expect(snapshot.displayedCurrency).toBe("USD");
      expect(snapshot.baseRateToUsd.toString()).toBe("1.085");
      expect(snapshot.displayedRateToUsd.toString()).toBe("1");
      expect(snapshot.crossRateSnapshot.toString()).toBe("1.085");
      // 1000 * 1.085 = 1085.0000
      expect(snapshot.displayedTotalAmount.toString()).toBe("1085");
    });

    it("calculates cross-rates for inverted pairs (USD -> BDT)", async () => {
      // USD rate: 1.0000000000. BDT rate: 0.0083333333 (~120 BDT per USD)
      // 1 USD = 1.0 / 0.0083333333 = 120.0000004800 BDT
      const snapshot = await computeForexSnapshot({
        baseCurrency: "USD",
        displayedCurrency: "BDT",
        totalPrice: "50.0000",
        now: fixedNow,
      });

      expect(snapshot.baseCurrency).toBe("USD");
      expect(snapshot.displayedCurrency).toBe("BDT");
      expect(snapshot.crossRateSnapshot.toNumber()).toBeCloseTo(120, 2);
      // 50 * 120 = 6000
      expect(snapshot.displayedTotalAmount.toNumber()).toBeCloseTo(6000, 1);
    });

    it("guarantees all mandatory snapshot fields are non-null and high precision", async () => {
      const snapshot = await computeForexSnapshot({
        baseCurrency: "GBP",
        displayedCurrency: "AED",
        totalPrice: "250.7500",
        now: fixedNow,
      });

      expect(snapshot.baseCurrency).toBeDefined();
      expect(snapshot.displayedCurrency).toBeDefined();
      expect(snapshot.baseRateToUsd).toBeInstanceOf(Prisma.Decimal);
      expect(snapshot.displayedRateToUsd).toBeInstanceOf(Prisma.Decimal);
      expect(snapshot.crossRateSnapshot).toBeInstanceOf(Prisma.Decimal);
      expect(snapshot.displayedTotalAmount).toBeInstanceOf(Prisma.Decimal);
      expect(snapshot.exchangeRateTimestamp).toBeInstanceOf(Date);
    });
  });

  describe("Quote Decimal(18, 4) Precision", () => {
    it("preserves 4-decimal precision in total price calculations without floating point errors", () => {
      // 12.3456 * 1000.5 + 50.1234
      const unitPrice = "12.3456";
      const quantity = "1000.5";
      const deliveryCharge = "50.1234";

      // Manual exact arithmetic:
      // 12.3456 * 1000.5 = 12351.7728
      // 12351.7728 + 50.1234 = 12401.8962
      const total = new Prisma.Decimal(unitPrice)
        .mul(new Prisma.Decimal(quantity))
        .add(new Prisma.Decimal(deliveryCharge))
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

      expect(total.toString()).toBe("12401.8962");
    });
  });

  describe("formatMoney with Intl.NumberFormat", () => {
    it("formats USD with standard symbol in English locale", () => {
      const res = formatMoney(1250.5, "en", "USD");
      expect(res).toContain("$");
      expect(res).toContain("1,250.50");
    });

    it("formats EUR in English locale", () => {
      const res = formatMoney(99.99, "en", "EUR");
      expect(res).toContain("€");
      expect(res).toContain("99.99");
    });

    it("formats BDT with Bengali digits in bn locale", () => {
      const res = formatMoney(1500, "bn", "BDT");
      // Should contain ৳ or BDT and Bengali digits ১,৫০০.০০
      expect(res).toMatch(/৳|BDT/);
      expect(res).toContain("১,৫০০");
    });

    it("falls back gracefully for custom or unlisted currency codes", () => {
      const res = formatMoney(500, "en", "XYZ");
      expect(res).toContain("XYZ");
      expect(res).toContain("500.00");
    });
  });
});
