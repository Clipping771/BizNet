import { describe, it, expect } from "vitest";
import {
  calculateSupplierScore,
  rankEligibleSuppliers,
  haversineDistanceKm,
  type SupplierMatchInput,
  type RequestMatchInput,
} from "@/lib/matching/score";

describe("lib/matching/score.ts - Matching Engine Scoring & Ranking (§8.6, F8, C2)", () => {
  const fixedNow = new Date("2026-10-27T10:00:00.000Z");

  it("calculates Haversine distance accurately", () => {
    // Mirpur to Dhanmondi is approx 6.5 - 7.5 km
    const dist = haversineDistanceKm(23.8041, 90.3667, 23.7461, 90.3742);
    expect(dist).toBeGreaterThan(6.0);
    expect(dist).toBeLessThan(7.5);
  });

  describe("Formula Table Tests (§8.6)", () => {
    const tableCases = [
      {
        name: "VERIFIED with category listing, delivery area match, perfect response, perfect reliability, recent quoter -> 100 pts",
        supplier: {
          id: "sup_1",
          verificationStatus: "VERIFIED",
          createdAt: new Date("2026-01-01"),
          deliveryAreas: ["Mirpur", "Uttara"],
          hasCategoryListing: true,
          invitesLast60Days: 10,
          quotesFromInvitesLast60Days: 10,
          feedbacksLast180Days: [
            { onTime: true, quantityCorrect: true, matchedSpec: true },
            { onTime: true, quantityCorrect: true, matchedSpec: true },
            { onTime: true, quantityCorrect: true, matchedSpec: true },
          ],
          hasQuotedLast14Days: true,
        } as SupplierMatchInput,
        expected: {
          verifiedPts: 30,
          listingPts: 25,
          distancePts: 15,
          responsePts: 15,
          reliabilityPts: 10,
          recencyPts: 5,
          totalScore: 100,
        },
      },
      {
        name: "BASIC with category listing, neutral response (<5 invites), neutral reliability (<3 feedbacks), no recent quote -> 15+25+15+8+5+0 = 68 pts",
        supplier: {
          id: "sup_2",
          verificationStatus: "BASIC",
          createdAt: new Date("2026-01-01"),
          deliveryAreas: ["Mirpur"],
          hasCategoryListing: true,
          invitesLast60Days: 2, // < 5 -> neutral r=0.5 -> round(15*0.5) = 8
          quotesFromInvitesLast60Days: 1,
          feedbacksLast180Days: [
            { onTime: true, quantityCorrect: true, matchedSpec: true },
          ], // < 3 -> neutral f=0.5 -> round(10*0.5) = 5
          hasQuotedLast14Days: false,
        } as SupplierMatchInput,
        expected: {
          verifiedPts: 15,
          listingPts: 25,
          distancePts: 15,
          responsePts: 8,
          reliabilityPts: 5,
          recencyPts: 0,
          totalScore: 68,
        },
      },
      {
        name: "Declared category only (hasCategoryListing = false) gets 0 listingPts but remains eligible",
        supplier: {
          id: "sup_3",
          verificationStatus: "VERIFIED",
          createdAt: new Date("2026-01-01"),
          deliveryAreas: ["Mirpur"],
          hasCategoryListing: false, // 0 pts
          invitesLast60Days: 10,
          quotesFromInvitesLast60Days: 0, // 0% response -> 0 pts
          feedbacksLast180Days: [], // neutral f=0.5 -> 5 pts
          hasQuotedLast14Days: false, // 0 pts
        } as SupplierMatchInput,
        expected: {
          verifiedPts: 30,
          listingPts: 0,
          distancePts: 15,
          responsePts: 0,
          reliabilityPts: 5,
          recencyPts: 0,
          totalScore: 50,
        },
      },
      {
        name: "Coordinates-based distance decay within matchingRadiusKm (25 km)",
        supplier: {
          id: "sup_4",
          verificationStatus: "VERIFIED",
          createdAt: new Date("2026-01-01"),
          deliveryAreas: [], // Not listed explicitly, uses coords
          lat: 23.7461, // Dhanmondi
          lng: 90.3742,
          hasCategoryListing: true,
          invitesLast60Days: 0, // neutral 8
          quotesFromInvitesLast60Days: 0,
          feedbacksLast180Days: [], // neutral 5
          hasQuotedLast14Days: false, // 0
        } as SupplierMatchInput,
        // Mirpur to Dhanmondi dist approx 6.5km -> 1 - 6.5/25 = 0.74 -> 15 * 0.74 = 11 pts
        expected: {
          verifiedPts: 30,
          listingPts: 25,
          distancePts: 11,
          responsePts: 8,
          reliabilityPts: 5,
          recencyPts: 0,
          totalScore: 79,
        },
      },
    ];

    for (const tc of tableCases) {
      it(tc.name, () => {
        const req: RequestMatchInput = {
          deliveryArea: "Mirpur",
          lat: 23.8041,
          lng: 90.3667,
        };
        const breakdown = calculateSupplierScore(tc.supplier, req, {
          now: fixedNow,
          matchingRadiusKm: 25,
          reliabilityMinFeedbacks: 3,
        });

        expect(breakdown.verifiedPts).toBe(tc.expected.verifiedPts);
        expect(breakdown.listingPts).toBe(tc.expected.listingPts);
        expect(breakdown.distancePts).toBe(tc.expected.distancePts);
        expect(breakdown.responsePts).toBe(tc.expected.responsePts);
        expect(breakdown.reliabilityPts).toBe(tc.expected.reliabilityPts);
        expect(breakdown.recencyPts).toBe(tc.expected.recencyPts);
        expect(breakdown.totalScore).toBe(tc.expected.totalScore);
      });
    }
  });

  describe("Tie-break order (§8.6)", () => {
    it("breaks ties in exact order: higher score -> VERIFIED before BASIC -> earlier verifiedAt -> smaller business id", () => {
      const dateA = new Date("2026-01-10");
      const dateB = new Date("2026-02-10");

      const supHigh = {
        id: "sup_z",
        verificationStatus: "BASIC",
        createdAt: new Date("2026-01-01"),
        deliveryAreas: ["Mirpur"],
        hasCategoryListing: true,
        invitesLast60Days: 10,
        quotesFromInvitesLast60Days: 10,
        feedbacksLast180Days: [
          { onTime: true, quantityCorrect: true, matchedSpec: true },
          { onTime: true, quantityCorrect: true, matchedSpec: true },
          { onTime: true, quantityCorrect: true, matchedSpec: true },
        ],
        hasQuotedLast14Days: true, // total = 15+25+15+15+10+5 = 85
      } as SupplierMatchInput;

      // Both have total = 30+25+15+8+5+0 = 83
      const supVerifiedEarlier = {
        id: "sup_m",
        verificationStatus: "VERIFIED",
        verifiedAt: dateA,
        createdAt: new Date("2026-01-01"),
        deliveryAreas: ["Mirpur"],
        hasCategoryListing: true,
        invitesLast60Days: 0,
        quotesFromInvitesLast60Days: 0,
        feedbacksLast180Days: [],
        hasQuotedLast14Days: false,
      } as SupplierMatchInput;

      const supVerifiedLater = {
        id: "sup_a",
        verificationStatus: "VERIFIED",
        verifiedAt: dateB,
        createdAt: new Date("2026-01-01"),
        deliveryAreas: ["Mirpur"],
        hasCategoryListing: true,
        invitesLast60Days: 0,
        quotesFromInvitesLast60Days: 0,
        feedbacksLast180Days: [],
        hasQuotedLast14Days: false,
      } as SupplierMatchInput;

      // Same score and verifiedAt, different IDs: sup_b vs sup_c
      const supIdB = {
        id: "sup_b",
        verificationStatus: "VERIFIED",
        verifiedAt: dateA,
        createdAt: new Date("2026-01-01"),
        deliveryAreas: ["Mirpur"],
        hasCategoryListing: true,
        invitesLast60Days: 0,
        quotesFromInvitesLast60Days: 0,
        feedbacksLast180Days: [],
        hasQuotedLast14Days: false,
      } as SupplierMatchInput;

      const supIdC = {
        id: "sup_c",
        verificationStatus: "VERIFIED",
        verifiedAt: dateA,
        createdAt: new Date("2026-01-01"),
        deliveryAreas: ["Mirpur"],
        hasCategoryListing: true,
        invitesLast60Days: 0,
        quotesFromInvitesLast60Days: 0,
        feedbacksLast180Days: [],
        hasQuotedLast14Days: false,
      } as SupplierMatchInput;

      const req: RequestMatchInput = { deliveryArea: "Mirpur" };
      const ranked = rankEligibleSuppliers(
        [supIdC, supVerifiedLater, supHigh, supVerifiedEarlier, supIdB],
        req,
        { now: fixedNow }
      );

      // Rank 1: supHigh (score 85)
      expect(ranked[0].supplierId).toBe("sup_z");
      expect(ranked[0].rank).toBe(1);

      // Rank 2 and 3: between sup_b, sup_c, sup_m (all have score 83, VERIFIED, verifiedAt dateA)
      // Lexicographically: sup_b, then sup_c, then sup_m
      expect(ranked[1].supplierId).toBe("sup_b");
      expect(ranked[2].supplierId).toBe("sup_c");
      expect(ranked[3].supplierId).toBe("sup_m");

      // Rank 5: supVerifiedLater (score 83, VERIFIED, verifiedAt dateB)
      expect(ranked[4].supplierId).toBe("sup_a");
      expect(ranked[4].rank).toBe(5);
    });
  });
});
