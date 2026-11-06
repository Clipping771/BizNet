import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing modules
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
    },
    request: {
      findMany: vi.fn(),
    },
    listing: {
      findMany: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  getBuyerInterestProfile,
  SIGNAL_WEIGHTS,
  DEFAULT_DECAY_LAMBDA,
} from "@/lib/algo/buyerProfile";
import { getPersonalizedRecommendations } from "@/lib/algo/recommendations";

describe("Algorithmic Buyer Profiling & Retargeting Engine", () => {
  const fixedNow = new Date("2026-10-30T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Signal Weights & Mathematical Decay Properties", () => {
    it("has expected signal weight hierarchy prioritizing high-intent commercial actions", () => {
      expect(SIGNAL_WEIGHTS.request_created).toBeGreaterThan(SIGNAL_WEIGHTS.quote_requested);
      expect(SIGNAL_WEIGHTS.quote_requested).toBeGreaterThan(SIGNAL_WEIGHTS.conversation_started);
      expect(SIGNAL_WEIGHTS.conversation_started).toBeGreaterThan(SIGNAL_WEIGHTS.listing_click);
      expect(SIGNAL_WEIGHTS.listing_click).toBeGreaterThan(SIGNAL_WEIGHTS.listing_view);
      expect(SIGNAL_WEIGHTS.listing_view).toBeGreaterThan(SIGNAL_WEIGHTS.category_browse);
      expect(SIGNAL_WEIGHTS.dismiss_recommendation).toBeLessThan(0); // negative penalty
    });

    it("verifies exponential time decay half-life is approximately 4.6 days", () => {
      const halfLifeDays = 4.62;
      const decay = Math.exp(-DEFAULT_DECAY_LAMBDA * halfLifeDays);
      expect(decay).toBeCloseTo(0.5, 1);
    });

    it("returns empty profile if no userId or businessId is supplied", async () => {
      const profile = await getBuyerInterestProfile({ now: fixedNow });
      expect(profile.topCategories).toEqual([]);
      expect(profile.totalSignals).toBe(0);
      expect(profile.viewedListingIds).toEqual([]);
    });
  });

  describe("getBuyerInterestProfile", () => {
    it("aggregates events and weights them by recency", async () => {
      const today = new Date(fixedNow.getTime());
      const fourDaysAgo = new Date(fixedNow.getTime() - 4.62 * 86400 * 1000);

      vi.mocked(prisma.event.findMany).mockResolvedValueOnce([
        {
          id: "ev1",
          name: "listing_click",
          userId: "user_1",
          businessId: "biz_1",
          props: { categorySlug: "packaging", listingId: "list_1" },
          createdAt: today,
        } as any,
        {
          id: "ev2",
          name: "listing_view",
          userId: "user_1",
          businessId: "biz_1",
          props: { categorySlug: "raw-cotton", listingId: "list_2" },
          createdAt: fourDaysAgo,
        } as any,
        {
          id: "ev3",
          name: "search",
          userId: "user_1",
          businessId: "biz_1",
          props: { q: "corrugated boxes" },
          createdAt: today,
        } as any,
      ]);

      vi.mocked(prisma.request.findMany).mockResolvedValueOnce([]);

      const profile = await getBuyerInterestProfile({
        userId: "user_1",
        businessId: "biz_1",
        now: fixedNow,
      });

      // packaging: 3.5 * exp(0) = 3.5
      // raw-cotton: 2.0 * exp(-0.15 * 4.62) ~= 2.0 * 0.5 = 1.0
      expect(profile.categoryScores["packaging"]).toBeCloseTo(3.5, 1);
      expect(profile.categoryScores["raw-cotton"]).toBeCloseTo(1.0, 1);
      expect(profile.topCategories[0]).toBe("packaging");
      expect(profile.topCategories[1]).toBe("raw-cotton");
      expect(profile.viewedListingIds).toContain("list_1");
      expect(profile.viewedListingIds).toContain("list_2");
      expect(profile.recentSearchTerms).toContain("corrugated boxes");
    });

    it("handles dismiss_recommendation by penalizing the category and recording dismissed listing", async () => {
      vi.mocked(prisma.event.findMany).mockResolvedValueOnce([
        {
          id: "ev1",
          name: "listing_click",
          userId: "user_1",
          businessId: "biz_1",
          props: { categorySlug: "chemicals", listingId: "list_10" },
          createdAt: fixedNow,
        } as any,
        {
          id: "ev2",
          name: "dismiss_recommendation",
          userId: "user_1",
          businessId: "biz_1",
          props: { categorySlug: "chemicals", listingId: "list_10" },
          createdAt: fixedNow,
        } as any,
      ]);

      vi.mocked(prisma.request.findMany).mockResolvedValueOnce([]);

      const profile = await getBuyerInterestProfile({
        userId: "user_1",
        businessId: "biz_1",
        now: fixedNow,
      });

      expect(profile.dismissedListingIds.includes("list_10")).toBe(true);
      expect(profile.dismissedCategories.includes("chemicals")).toBe(true);
      expect(profile.categoryScores["chemicals"]).toBe(-999);
      expect(profile.topCategories).not.toContain("chemicals");
    });

    it("ensures retargeting remains stopped after recompute when a non-recurring deal completed", async () => {
      const fiveDaysAgo = new Date(fixedNow.getTime() - 5 * 86400 * 1000);
      const twoDaysAgo = new Date(fixedNow.getTime() - 2 * 86400 * 1000);

      // Past events in corrugated-box AND bubble-wrap from 5 days ago
      vi.mocked(prisma.event.findMany).mockResolvedValueOnce([
        {
          id: "ev1",
          name: "listing_click",
          userId: "user_1",
          businessId: "biz_1",
          props: { categorySlug: "corrugated-box", listingId: "list_box_1" },
          createdAt: fiveDaysAgo,
        } as any,
        {
          id: "ev2",
          name: "listing_click",
          userId: "user_1",
          businessId: "biz_1",
          props: { categorySlug: "bubble-wrap", listingId: "list_wrap_1" },
          createdAt: fiveDaysAgo,
        } as any,
      ]);

      // Non-recurring completed order in corrugated-box ONLY (2 days ago)
      vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
        {
          completedAt: twoDaysAgo,
          createdAt: twoDaysAgo,
          quote: {
            request: {
              category: { slug: "corrugated-box" },
              repeatOfRequestId: null, // non-recurring
            },
          },
        } as any,
      ]);

      vi.mocked(prisma.request.findMany).mockResolvedValueOnce([]);

      const profile = await getBuyerInterestProfile({
        userId: "user_1",
        businessId: "biz_1",
        now: fixedNow,
      });

      // 1. Signals prior to the completed deal in corrugated-box must be suppressed
      expect(profile.categoryScores["corrugated-box"]).toBeUndefined();
      expect(profile.topCategories).not.toContain("corrugated-box");

      // 2. Other categories (bubble-wrap) MUST remain active and untouched!
      expect(profile.categoryScores["bubble-wrap"]).toBeDefined();
      expect(profile.categoryScores["bubble-wrap"]).toBeGreaterThan(0);
      expect(profile.topCategories).toContain("bubble-wrap");
    });

    it("verifies multi-category deal isolation: buying corrugated boxes leaves paper, tape, and labels completely intact and allows post-deal box interest", async () => {
      const fiveDaysAgo = new Date(fixedNow.getTime() - 5 * 86400 * 1000);
      const twoDaysAgo = new Date(fixedNow.getTime() - 2 * 86400 * 1000);
      const oneDayAgo = new Date(fixedNow.getTime() - 1 * 86400 * 1000);

      // Signals across 4 distinct categories before the deal (5 days ago)
      // Plus 1 signal for corrugated-box AFTER the deal (1 day ago)
      vi.mocked(prisma.event.findMany).mockResolvedValueOnce([
        // Corrugated box: pre-deal signal from 5 days ago (must be suppressed)
        {
          id: "ev_box_old",
          name: "listing_click",
          userId: "user_1",
          businessId: "biz_1",
          props: { categorySlug: "corrugated-box", listingId: "box_old" },
          createdAt: fiveDaysAgo,
        } as any,
        // Corrugated box: post-deal signal from 1 day ago (must be KEPT)
        {
          id: "ev_box_new",
          name: "listing_click",
          userId: "user_1",
          businessId: "biz_1",
          props: { categorySlug: "corrugated-box", listingId: "box_new" },
          createdAt: oneDayAgo,
        } as any,
        // Kraft paper: pre-deal signal from 5 days ago (must remain intact)
        {
          id: "ev_paper",
          name: "listing_click",
          userId: "user_1",
          businessId: "biz_1",
          props: { categorySlug: "kraft-paper", listingId: "paper_1" },
          createdAt: fiveDaysAgo,
        } as any,
        // Packaging tape: pre-deal signal from 5 days ago (must remain intact)
        {
          id: "ev_tape",
          name: "listing_click",
          userId: "user_1",
          businessId: "biz_1",
          props: { categorySlug: "packaging-tape", listingId: "tape_1" },
          createdAt: fiveDaysAgo,
        } as any,
        // Box labels: pre-deal signal from 5 days ago (must remain intact)
        {
          id: "ev_label",
          name: "listing_click",
          userId: "user_1",
          businessId: "biz_1",
          props: { categorySlug: "box-labels", listingId: "label_1" },
          createdAt: fiveDaysAgo,
        } as any,
      ]);

      // Non-recurring completed order in corrugated-box ONLY (completed 2 days ago)
      vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
        {
          completedAt: twoDaysAgo,
          createdAt: twoDaysAgo,
          quote: {
            request: {
              category: { slug: "corrugated-box" },
              repeatOfRequestId: null,
            },
          },
        } as any,
      ]);

      vi.mocked(prisma.request.findMany).mockResolvedValueOnce([]);

      const profile = await getBuyerInterestProfile({
        userId: "user_1",
        businessId: "biz_1",
        now: fixedNow,
      });

      // Calculate expected decay score for a signal from 5 days ago:
      // Weight = 3.5 * exp(-0.15 * 5) = 3.5 * exp(-0.75) ≈ 1.653
      const expectedFiveDayScore = 3.5 * Math.exp(-0.15 * 5);
      // Expected score for 1 day ago: 3.5 * exp(-0.15 * 1) ≈ 3.012
      const expectedOneDayScore = 3.5 * Math.exp(-0.15 * 1);

      // 1. Kraft paper, Packaging tape, Box labels must be COMPLETELY INTACT with exact expected score
      expect(profile.categoryScores["kraft-paper"]).toBeCloseTo(expectedFiveDayScore, 4);
      expect(profile.categoryScores["packaging-tape"]).toBeCloseTo(expectedFiveDayScore, 4);
      expect(profile.categoryScores["box-labels"]).toBeCloseTo(expectedFiveDayScore, 4);

      // 2. Corrugated box score should ONLY contain the post-deal signal (1 day ago), NOT the old 5-day signal
      expect(profile.categoryScores["corrugated-box"]).toBeCloseTo(expectedOneDayScore, 4);

      // 3. Top categories include all active categories
      expect(profile.topCategories).toContain("corrugated-box");
      expect(profile.topCategories).toContain("kraft-paper");
      expect(profile.topCategories).toContain("packaging-tape");
      expect(profile.topCategories).toContain("box-labels");
    });
  });

  describe("getPersonalizedRecommendations", () => {
    it("ranks candidates using multi-factor signals (trust, locality, interest, price)", async () => {
      // 1. Profile with interest in 'packaging'
      vi.mocked(prisma.event.findMany).mockResolvedValueOnce([
        {
          id: "ev1",
          name: "listing_click",
          userId: "user_1",
          businessId: "biz_1",
          props: { categorySlug: "packaging", listingId: "list_old" },
          createdAt: fixedNow,
        } as any,
      ]);
      vi.mocked(prisma.request.findMany).mockResolvedValueOnce([]);

      // 2. Candidate listings
      vi.mocked(prisma.listing.findMany).mockResolvedValueOnce([
        {
          id: "item_verified_local",
          title: "Custom Corrugated Packaging Boxes",
          unit: "pcs",
          priceMin: 25,
          priceMax: 35,
          currency: "BDT",
          moq: 1000,
          leadTimeDays: 7,
          imageKeys: [],
          createdAt: fixedNow,
          category: { slug: "packaging" },
          business: {
            id: "biz_sup_1",
            name: "Dhaka Pack Ltd",
            slug: "dhaka-pack",
            businessType: "Manufacturer",
            area: "Mirpur",
            city: "Dhaka",
            deliveryAreas: ["Mirpur", "Uttara"],
            verificationStatus: "VERIFIED",
          },
        } as any,
        {
          id: "item_basic_distant",
          title: "Standard Carton",
          unit: "pcs",
          priceMin: null,
          priceMax: null,
          currency: "BDT",
          moq: 500,
          leadTimeDays: 14,
          imageKeys: [],
          createdAt: new Date(fixedNow.getTime() - 40 * 86400 * 1000), // 40 days old
          category: { slug: "textiles" },
          business: {
            id: "biz_sup_2",
            name: "Chittagong Fabrics",
            slug: "ctg-fabrics",
            businessType: "Wholesaler",
            area: "Agrabad",
            city: "Chittagong",
            deliveryAreas: ["Agrabad"],
            verificationStatus: "BASIC",
          },
        } as any,
      ]);

      const recommendations = await getPersonalizedRecommendations({
        userId: "user_1",
        businessId: "biz_1",
        buyerArea: "Mirpur",
        buyerCity: "Dhaka",
        now: fixedNow,
      });

      expect(recommendations.length).toBe(2);
      // The verified local packaging item should outrank the distant textiles item
      expect(recommendations[0].id).toBe("item_verified_local");
      expect(recommendations[0].score).toBeGreaterThan(recommendations[1].score);
      expect(recommendations[0].reasonKey).toBe("algo.reason.viewed");
    });

    it("filters out explicitly excluded and dismissed listing IDs", async () => {
      vi.mocked(prisma.event.findMany).mockResolvedValueOnce([
        {
          id: "ev1",
          name: "dismiss_recommendation",
          userId: "user_1",
          businessId: "biz_1",
          props: { listingId: "list_dismissed" },
          createdAt: fixedNow,
        } as any,
      ]);
      vi.mocked(prisma.request.findMany).mockResolvedValueOnce([]);

      vi.mocked(prisma.listing.findMany).mockImplementationOnce((args: any) => {
        // Assert that dismissed & excluded IDs were passed to Prisma where clause
        expect(args.where.id.notIn).toContain("list_dismissed");
        expect(args.where.id.notIn).toContain("list_exclude_arg");
        return Promise.resolve([]) as any;
      });

      await getPersonalizedRecommendations({
        userId: "user_1",
        businessId: "biz_1",
        excludeListingIds: ["list_exclude_arg"],
        now: fixedNow,
      });
    });
  });
});
