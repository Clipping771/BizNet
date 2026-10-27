import { describe, it, expect } from "vitest";
import {
  evaluateQuotePriorities,
  type QuoteComparisonInput,
  type RequestComparisonContext,
} from "@/lib/compare/priority";
import { PaymentTerm, Priority, QuoteStatus } from "@prisma/client";

describe("lib/compare/priority.ts - Deterministic Priority Scoring (§8.8 A2, E2)", () => {
  const todayDhaka = new Date("2026-10-27T00:00:00.000Z");
  const neededByTomorrow = new Date("2026-10-28T23:59:59.000Z"); // 1 day
  const validFuture = new Date("2026-11-05T00:00:00.000Z");
  const now = new Date("2026-10-27T10:00:00.000Z");

  const quoteA: QuoteComparisonInput = {
    id: "quote_1",
    quoteRef: "Q1",
    totalPrice: 4500, // lower price
    deliveryDays: 3, // arrives Oct 30 -> LATE!
    paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
    validUntil: validFuture,
    status: QuoteStatus.SUBMITTED,
    createdAt: new Date("2026-10-27T08:00:00.000Z"),
    specMatch: { capacity_ml: "MATCH", has_lid: "MATCH" },
  };

  const quoteB: QuoteComparisonInput = {
    id: "quote_2",
    quoteRef: "Q2",
    totalPrice: 5000, // higher price
    deliveryDays: 1, // arrives Oct 28 -> ON TIME!
    paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
    validUntil: validFuture,
    status: QuoteStatus.SUBMITTED,
    createdAt: new Date("2026-10-27T09:00:00.000Z"),
    specMatch: { capacity_ml: "MATCH", has_lid: "DIFFERENT" }, // spec difference
  };

  it("marks late quotes and prevents late quotes from receiving 'best' tags", () => {
    const ctx: RequestComparisonContext = {
      neededBy: neededByTomorrow,
      preferredPaymentTerm: PaymentTerm.CASH_ON_DELIVERY,
      priority: Priority.BALANCED,
      comparableFieldKeys: ["capacity_ml", "has_lid"],
      todayDhaka,
    };

    const res = evaluateQuotePriorities([quoteA, quoteB], ctx, now);
    expect(res.quotes).toHaveLength(2);

    const q1 = res.quotes.find((q) => q.quoteRef === "Q1")!;
    const q2 = res.quotes.find((q) => q.quoteRef === "Q2")!;

    expect(q1.isLate).toBe(true);
    expect(q2.isLate).toBe(false);

    // Q1 has lowest price (4500 vs 5000), but because it is late, it NEVER receives "LOWEST_TOTAL" or any best tag
    expect(q1.tags).not.toContain("LOWEST_TOTAL");
    expect(q1.tags).toHaveLength(0);

    // Q2 has fastest delivery (1 day) and is not late -> gets "FASTEST"
    expect(q2.tags).toContain("FASTEST");
  });

  it("disqualifies late quotes from server best fit under SPEED and BALANCED priorities", () => {
    const ctxSpeed: RequestComparisonContext = {
      neededBy: neededByTomorrow,
      priority: Priority.SPEED,
      comparableFieldKeys: ["capacity_ml", "has_lid"],
      todayDhaka,
    };

    const resSpeed = evaluateQuotePriorities([quoteA, quoteB], ctxSpeed, now);
    const q1 = resSpeed.quotes.find((q) => q.quoteRef === "Q1")!;
    const q2 = resSpeed.quotes.find((q) => q.quoteRef === "Q2")!;

    expect(q1.eligibleForBestFit).toBe(false);
    expect(q2.eligibleForBestFit).toBe(true);
    expect(resSpeed.serverBestFitQuoteRef).toBe("Q2"); // Late quote is never best fit for SPEED!

    const ctxBalanced: RequestComparisonContext = {
      neededBy: neededByTomorrow,
      priority: Priority.BALANCED,
      comparableFieldKeys: ["capacity_ml", "has_lid"],
      todayDhaka,
    };

    const resBalanced = evaluateQuotePriorities([quoteA, quoteB], ctxBalanced, now);
    expect(resBalanced.serverBestFitQuoteRef).toBe("Q2"); // Late quote is never best fit for BALANCED!
  });

  it("applies 50% late penalty under PRICE priority", () => {
    const ctxPrice: RequestComparisonContext = {
      neededBy: neededByTomorrow,
      priority: Priority.PRICE,
      comparableFieldKeys: ["capacity_ml", "has_lid"],
      todayDhaka,
    };

    const res = evaluateQuotePriorities([quoteA, quoteB], ctxPrice, now);
    const q1 = res.quotes.find((q) => q.quoteRef === "Q1")!;

    // Under PRICE, late penalty halves the score: finalScore = round(rawScore * 0.5)
    expect(q1.finalScore).toBe(Math.round(q1.rawScore * 0.5 * 100) / 100);
    // Under PRICE, it remains eligible for best fit if its score after penalty still wins
    expect(q1.eligibleForBestFit).toBe(true);
  });

  it("handles empty quotes or all expired quotes cleanly with null best fit", () => {
    const expiredQuote: QuoteComparisonInput = {
      ...quoteA,
      validUntil: new Date("2026-10-20T00:00:00.000Z"), // Expired before now
    };

    const ctx: RequestComparisonContext = {
      neededBy: null,
      priority: Priority.PRICE,
      comparableFieldKeys: [],
      todayDhaka,
    };

    const res = evaluateQuotePriorities([expiredQuote], ctx, now);
    expect(res.quotes).toHaveLength(0);
    expect(res.serverBestFitId).toBeNull();
    expect(res.serverBestFitQuoteRef).toBeNull();
  });
});
