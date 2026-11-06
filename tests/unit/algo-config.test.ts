import { describe, it, expect } from "vitest";
import {
  SIGNAL_CONFIG,
  TRUST_MULTIPLIERS,
  SIGMOID_CONFIG,
  computeSigmoidAlpha,
  RANKING_WEIGHTS,
  calculateResponseScore,
  calculateExponentialDecay
} from "@/lib/algo/config";

describe("Algorithmic Configuration & Math Verification", () => {
  it("computes exact sigmoid cold-start blend alpha values", () => {
    // At n = 0, alpha should be very close to 0 (~0.018)
    const alpha0 = computeSigmoidAlpha(0);
    expect(alpha0).toBeCloseTo(0.018, 3);

    // At n = 2, alpha ~ 0.083
    const alpha2 = computeSigmoidAlpha(2);
    expect(alpha2).toBeCloseTo(0.083, 3);

    // At n = 5 (inflection point n0), alpha should be exactly 0.500
    const alpha5 = computeSigmoidAlpha(5);
    expect(alpha5).toBeCloseTo(0.500, 3);

    // At n = 8, alpha ~ 0.917
    const alpha8 = computeSigmoidAlpha(8);
    expect(alpha8).toBeCloseTo(0.917, 3);

    // At n = 10, alpha ~ 0.982
    const alpha10 = computeSigmoidAlpha(10);
    expect(alpha10).toBeCloseTo(0.982, 3);
  });

  it("verifies decay lambdas match desired half-lives", () => {
    // Half-life equation: t_half = ln(2) / lambda
    const ln2 = Math.LN2;

    // SLOW: lambda = 0.05 -> t_half ~ 13.86 days (~ 14 days)
    const slowHalfLife = ln2 / SIGNAL_CONFIG.RFQ_CREATED.lambda;
    expect(slowHalfLife).toBeCloseTo(13.86, 1);

    // MEDIUM: lambda = 0.15 -> t_half ~ 4.62 days
    const mediumHalfLife = ln2 / SIGNAL_CONFIG.REPEAT_LISTING_VIEW.lambda;
    expect(mediumHalfLife).toBeCloseTo(4.62, 1);

    // FAST: lambda = 0.40 -> t_half ~ 1.73 days
    const fastHalfLife = ln2 / SIGNAL_CONFIG.LISTING_DWELL.lambda;
    expect(fastHalfLife).toBeCloseTo(1.73, 1);
  });

  it("ensures ranking weights sum to 1.0", () => {
    const sum =
      RANKING_WEIGHTS.INTENT +
      RANKING_WEIGHTS.LOCATION +
      RANKING_WEIGHTS.VERIFICATION +
      RANKING_WEIGHTS.RESPONSE +
      RANKING_WEIGHTS.FRESHNESS;

    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("verifies trust multipliers scale properly", () => {
    expect(TRUST_MULTIPLIERS.UNVERIFIED).toBe(0.20);
    expect(TRUST_MULTIPLIERS.BASIC).toBe(0.80);
    expect(TRUST_MULTIPLIERS.VERIFIED).toBe(1.20);
  });

  it("assigns neutral 0.50 response score to new suppliers with null reply rate", () => {
    expect(calculateResponseScore(null)).toBe(0.50);
    expect(calculateResponseScore(undefined)).toBe(0.50);
    expect(calculateResponseScore(100)).toBe(1.00);
    expect(calculateResponseScore(50)).toBe(0.50);
    expect(calculateResponseScore(0)).toBe(0.00);
  });

  it("safely handles exponential decay calculations without NaN poisoning", () => {
    // Standard decay
    const val = calculateExponentialDecay(10.0, 0.05, 14);
    expect(val).toBeCloseTo(4.965, 2);

    // Delta days = 0 returns base weight
    expect(calculateExponentialDecay(10.0, 0.05, 0)).toBe(10.0);

    // DEAL_COMPLETED (lambda = 0) returns base weight
    expect(calculateExponentialDecay(10.0, 0, 10)).toBe(10.0);

    // Safeguard against NaN/Infinity
    expect(calculateExponentialDecay(NaN, 0.05, 5)).toBe(0);
    expect(calculateExponentialDecay(10.0, Infinity, 0)).toBe(0);
  });

  it("terminates retargeting on closed deal for non-recurring purchases", async () => {
    const { applyDealCompletionTermination } = await import("@/lib/algo/buyerProfile");
    
    const createSetArray = (items: string[] = []): string[] & { has: (val: string) => boolean } => {
      const set = new Set(items);
      const arr = Array.from(set) as string[] & { has: (val: string) => boolean };
      arr.has = (val: string) => arr.includes(val);
      return arr;
    };

    const initialProfile = {
      categoryScores: { "corrugated-box": 15.5, "bubble-wrap": 8.0 },
      topCategories: ["corrugated-box", "bubble-wrap"],
      viewedListingIds: ["listing-1", "listing-2"],
      dismissedListingIds: createSetArray(),
      dismissedCategories: createSetArray(),
      recentSearchTerms: ["box"],
      totalSignals: 5,
    };

    // Close deal on listing-1 in corrugated-box (non-recurring)
    applyDealCompletionTermination(initialProfile, [
      { listingId: "listing-1", categorySlug: "corrugated-box", isRecurring: false }
    ]);

    // listing-1 must now be excluded from retargeting
    expect(initialProfile.dismissedListingIds.has("listing-1")).toBe(true);

    // corrugated-box retargeting should be stopped
    expect(initialProfile.categoryScores["corrugated-box"]).toBeUndefined();
    expect(initialProfile.topCategories).not.toContain("corrugated-box");

    // bubble-wrap remains active
    expect(initialProfile.categoryScores["bubble-wrap"]).toBe(8.0);
    expect(initialProfile.topCategories).toContain("bubble-wrap");

    // Recurring purchase should NOT terminate category affinity
    applyDealCompletionTermination(initialProfile, [
      { listingId: "listing-2", categorySlug: "bubble-wrap", isRecurring: true }
    ]);
    expect(initialProfile.dismissedListingIds.has("listing-2")).toBe(true);
    expect(initialProfile.categoryScores["bubble-wrap"]).toBe(8.0);
    expect(initialProfile.topCategories).toContain("bubble-wrap");
  });
});
