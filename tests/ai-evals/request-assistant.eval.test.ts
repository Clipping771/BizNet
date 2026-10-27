/**
 * tests/ai-evals/request-assistant.eval.test.ts
 *
 * Comprehensive evaluation suite for AI Request Assistant (§8.4, §12, K2).
 * Contains >= 60 test cases covering:
 * - Bengali (15)
 * - English (15)
 * - Banglish (15)
 * - Mixed text (10)
 * - Relative dates & Ambiguous materials & Guardrails (10)
 *
 * Runs deterministically in CI with mock AI provider.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  processRequestWithAi,
  redactSensitiveData,
  checkProhibitedItems,
} from "@/lib/ai/requestAssistant";
import { RequestAssistantOutputSchema } from "@/lib/ai/prompts/requestAssistant.v1";
import { prisma } from "@/lib/prisma";

describe("AI Request Assistant Evaluation Suite (>= 60 cases)", () => {
  let testUserId: string;

  beforeAll(async () => {
    // Ensure test user exists
    const user = await prisma.user.findFirst();
    if (user) {
      testUserId = user.id;
    } else {
      const newUser = await prisma.user.create({
        data: {
          phone: "01700000099",
          phoneVerified: true,
          name: "Test User",
          role: "USER",
        },
      });
      testUserId = newUser.id;
    }

    // Clear previous test cached aiInteractions for clean evaluation (with where condition)
    await prisma.aiInteraction.deleteMany({
      where: { feature: "REQUEST_ASSISTANT" },
    });

    // Ensure settings exist
    await prisma.setting.upsert({
      where: { key: "prohibitedItems" },
      create: {
        key: "prohibitedItems",
        value: ["heroine", "weapons", "illegal narcotics"],
      },
      update: {
        value: ["heroine", "weapons", "illegal narcotics"],
      },
    });
  });

  // 1. Bengali Cases (15)
  const bengaliCases = [
    { text: "কাল মিরপুরে ৫০০টা ৭৫০ মিলি ঢাকনাওয়ালা কন্টেইনার লাগবে", expectedCat: "containers" },
    { text: "১০০০ পিস বার্গার বক্স লাগবে ধানমন্ডিতে কালকের মধ্যে", expectedCat: "food_boxes" },
    { text: "৫০০ টি ক্রাফট পেপার শপিং ব্যাগ দরকার উত্তরা", expectedCat: "carry_bags" },
    { text: "২৫০ মিলি ২০০ টা কফি কাপ লাগবে গুলশানে", expectedCat: "cups" },
    { text: "২ প্লাই ৫০০ প্যাকেট টিস্যু লাগবে মতিঝিল", expectedCat: "tissue" },
    { text: "১০০০ টা প্লাস্টিক চামচ লাগবে পরশু বনানীতে", expectedCat: "cutlery" },
    { text: "৩০ সেমি চওড়া ৫০ রোল ফয়েল র‍্যাপ লাগবে", expectedCat: "foil_wrap" },
    { text: "৫০০ টা পেপার কন্টেইনার লাগবে কালকে", expectedCat: "containers" },
    { text: "২০০ টি লাঞ্চ বক্স লাগবে মিরপুর ২", expectedCat: "food_boxes" },
    { text: "৩০০ টি লুপ হ্যান্ডেল ব্যাগ লাগবে পুরান ঢাকা", expectedCat: "carry_bags" },
    { text: "১০০ টা ঢাকনাসহ কাপ লাগবে কাল", expectedCat: "cups" },
    { text: "পরশু ৫০০ টা বিরিয়ানি বক্স লাগবে", expectedCat: "food_boxes" },
    { text: "২০০ টা কাঠের চামচ লাগবে", expectedCat: "cutlery" },
    { text: "কাল ৫০ প্যাকেট ফেসিয়াল টিস্যু লাগবে", expectedCat: "tissue" },
    { text: "১০০০ টা ফুড কন্টেইনার লাগবে", expectedCat: "containers" },
  ];

  describe("Bengali Natural Language Cases (15)", () => {
    bengaliCases.forEach((tc, idx) => {
      it(`BN-${idx + 1}: ${tc.text.slice(0, 30)}...`, async () => {
        const res = await processRequestWithAi({
          userId: testUserId,
          userText: tc.text,
          uiLanguage: "bn",
        });

        expect(res.success).toBe(true);
        expect(res.data).not.toBeNull();
        expect(res.data?.categorySlug).toBe(tc.expectedCat);
        expect(RequestAssistantOutputSchema.safeParse(res.data).success).toBe(true);
      });
    });
  });

  // 2. English Cases (15)
  const englishCases = [
    { text: "Need 500 pcs 750ml food containers with lid by tomorrow in Mirpur", expectedCat: "containers" },
    { text: "1000 burger boxes needed in Dhanmondi day after tomorrow", expectedCat: "food_boxes" },
    { text: "500 kraft shopping bags needed for showroom in Uttara", expectedCat: "carry_bags" },
    { text: "200 coffee cups 250ml needed in Gulshan", expectedCat: "cups" },
    { text: "500 packs of 2-ply facial tissue needed by next week", expectedCat: "tissue" },
    { text: "1000 plastic spoons needed for restaurant delivery", expectedCat: "cutlery" },
    { text: "50 rolls of 30cm aluminum foil wrap needed", expectedCat: "foil_wrap" },
    { text: "Need 300 paper takeaway containers by tomorrow", expectedCat: "containers" },
    { text: "400 loop handle carry bags needed in Banani", expectedCat: "carry_bags" },
    { text: "250ml hot beverage cups 100 pcs needed", expectedCat: "cups" },
    { text: "Need 500 cutlery spoon items", expectedCat: "cutlery" },
    { text: "150 food boxes needed for catering event", expectedCat: "food_boxes" },
    { text: "Need 200 plastic pp containers urgently", expectedCat: "containers" },
    { text: "Looking for 1000 brown kraft carry bags", expectedCat: "carry_bags" },
    { text: "600 paper cups for coffee shop", expectedCat: "cups" },
  ];

  describe("English Cases (15)", () => {
    englishCases.forEach((tc, idx) => {
      it(`EN-${idx + 1}: ${tc.text.slice(0, 30)}...`, async () => {
        const res = await processRequestWithAi({
          userId: testUserId,
          userText: tc.text,
          uiLanguage: "en",
        });

        expect(res.success).toBe(true);
        expect(res.data).not.toBeNull();
        expect(res.data?.categorySlug).toBe(tc.expectedCat);
        expect(RequestAssistantOutputSchema.safeParse(res.data).success).toBe(true);
      });
    });
  });

  // 3. Banglish Cases (15)
  const banglishCases = [
    { text: "Kal Mirpur e 500 ta 750ml lid shoho container lagbe", expectedCat: "containers" },
    { text: "Dhanmondi te 1000 ta burger box dorkar porshu", expectedCat: "food_boxes" },
    { text: "500 ta kraft shopping bag lagbe Uttara te kal", expectedCat: "carry_bags" },
    { text: "Gulshan e 200 ta coffee cup lagbe", expectedCat: "cups" },
    { text: "500 packet tissue lagbe agami kal", expectedCat: "tissue" },
    { text: "1000 ta plastic spoon lagbe delivery r jonno", expectedCat: "cutlery" },
    { text: "50 roll aluminium foil wrap lagbe", expectedCat: "foil_wrap" },
    { text: "300 ta paper container dorkar kal dupure", expectedCat: "containers" },
    { text: "Banani showroom er jonno 400 ta bag lagbe", expectedCat: "carry_bags" },
    { text: "100 ta 250ml cup lagbe lid shoho", expectedCat: "cups" },
    { text: "Porshu 500 ta food box lagbe catering er jonno", expectedCat: "food_boxes" },
    { text: "200 ta spoon lagbe", expectedCat: "cutlery" },
    { text: "Kal 50 pack tissue lagbe Mirpur e", expectedCat: "tissue" },
    { text: "1000 ta pp plastic container lagbe", expectedCat: "containers" },
    { text: "750ml container 500 piece lagbe kal", expectedCat: "containers" },
  ];

  describe("Banglish Cases (15)", () => {
    banglishCases.forEach((tc, idx) => {
      it(`BL-${idx + 1}: ${tc.text.slice(0, 30)}...`, async () => {
        const res = await processRequestWithAi({
          userId: testUserId,
          userText: tc.text,
          uiLanguage: "bn",
        });

        expect(res.success).toBe(true);
        expect(res.data).not.toBeNull();
        expect(res.data?.categorySlug).toBe(tc.expectedCat);
        expect(RequestAssistantOutputSchema.safeParse(res.data).success).toBe(true);
      });
    });
  });

  // 4. Mixed Text Cases (10)
  const mixedCases = [
    { text: "Urgent: ৫০০ pcs 750ml container লাগবে Mirpur এ tomorrow", expectedCat: "containers" },
    { text: "১০০০টা burger box needed in Dhanmondi by কাল", expectedCat: "food_boxes" },
    { text: "৫০০ pcs kraft paper shopping bag লাগবে Uttara showroom এ", expectedCat: "carry_bags" },
    { text: "২০০ pcs 250ml coffee cup লাগবে Gulshan branch এ", expectedCat: "cups" },
    { text: "৫০০ pack 2-ply tissue needed পরশু", expectedCat: "tissue" },
    { text: "১০০০ pcs plastic spoon লাগবে catering এর জন্য", expectedCat: "cutlery" },
    { text: "৫০ roll foil wrap দরকার urgent", expectedCat: "foil_wrap" },
    { text: "Need ৩০০ pcs paper container কালকে", expectedCat: "containers" },
    { text: "৪০০ pcs loop handle bag needed in Banani", expectedCat: "carry_bags" },
    { text: "১০০ pcs cup with lid লাগবে tomorrow", expectedCat: "cups" },
  ];

  describe("Mixed Bengali-English Cases (10)", () => {
    mixedCases.forEach((tc, idx) => {
      it(`MIX-${idx + 1}: ${tc.text.slice(0, 30)}...`, async () => {
        const res = await processRequestWithAi({
          userId: testUserId,
          userText: tc.text,
          uiLanguage: "bn",
        });

        expect(res.success).toBe(true);
        expect(res.data).not.toBeNull();
        expect(res.data?.categorySlug).toBe(tc.expectedCat);
        expect(RequestAssistantOutputSchema.safeParse(res.data).success).toBe(true);
      });
    });
  });

  // 5. Relative Dates, Ambiguity & Guardrails (10)
  describe("Relative Dates, Ambiguities & Guardrails (10)", () => {
    it("REL-1: Parses 'কাল' as tomorrow date", async () => {
      const res = await processRequestWithAi({
        userId: testUserId,
        userText: "কাল ৫০০টি কন্টেইনার লাগবে",
      });
      expect(res.success).toBe(true);
      const expectedTomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
      expect(res.data?.neededBy).toBe(expectedTomorrow);
    });

    it("REL-2: Parses 'tomorrow' as tomorrow date", async () => {
      const res = await processRequestWithAi({
        userId: testUserId,
        userText: "Need 500 containers tomorrow",
      });
      expect(res.success).toBe(true);
      const expectedTomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
      expect(res.data?.neededBy).toBe(expectedTomorrow);
    });

    it("REL-3: Parses 'পরশু' as day after tomorrow", async () => {
      const res = await processRequestWithAi({
        userId: testUserId,
        userText: "পরশু ৫০০টি ফুড বক্স লাগবে",
      });
      expect(res.success).toBe(true);
      const expectedPorshu = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
      expect(res.data?.neededBy).toBe(expectedPorshu);
    });

    it("REL-4: Parses 'next week' as +7 days", async () => {
      const res = await processRequestWithAi({
        userId: testUserId,
        userText: "Need 500 tissue packs next week",
      });
      expect(res.success).toBe(true);
      const expectedNextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
      expect(res.data?.neededBy).toBe(expectedNextWeek);
    });

    it("AMB-1: Adds ambiguous container material to uncertainFields", async () => {
      const res = await processRequestWithAi({
        userId: testUserId,
        userText: "৫০০টি ৭৫০ মিলি কন্টেইনার লাগবে",
      });
      expect(res.success).toBe(true);
      expect(res.data?.uncertainFields).toContain("material");
      expect(res.data?.questions.some((q) => q.field === "material")).toBe(true);
    });

    it("AMB-2: Adds ambiguous carry bag handle type to uncertainFields", async () => {
      const res = await processRequestWithAi({
        userId: testUserId,
        userText: "৫০০টি ক্রাফট পেপার শপিং ব্যাগ লাগবে",
      });
      expect(res.success).toBe(true);
      expect(res.data?.uncertainFields).toContain("handle_type");
    });

    it("GUARD-1: Redacts phone numbers before sending to AI", () => {
      const raw = "Call me at 01712345678 or 01899887766 for 500 boxes";
      const redacted = redactSensitiveData(raw);
      expect(redacted).not.toContain("01712345678");
      expect(redacted).not.toContain("01899887766");
      expect(redacted).toContain("[REDACTED_PHONE]");
    });

    it("GUARD-2: Redacts URLs before sending to AI", () => {
      const raw = "See my shop at https://example.com/products or www.packaging.com";
      const redacted = redactSensitiveData(raw);
      expect(redacted).not.toContain("https://example.com");
      expect(redacted).toContain("[REDACTED_URL]");
    });

    it("GUARD-3: Gracefully blocks prohibited items", async () => {
      const isProh = await checkProhibitedItems("Looking for packaging for heroine supplies");
      expect(isProh).toBe(true);

      const res = await processRequestWithAi({
        userId: testUserId,
        userText: "Need heroine delivery packaging",
      });
      expect(res.success).toBe(false);
      expect(res.fallback).toBe(true);
      expect(res.prohibited).toBe(true);
    });

    it("GUARD-4: 24-hour inputHash cache hits for identical input", async () => {
      const text = "কাল মিরপুরে ৫০০টা ৭৫০ মিলি ঢাকনাওয়ালা কন্টেইনার লাগবে";
      const res1 = await processRequestWithAi({
        userId: testUserId,
        userText: text,
      });
      expect(res1.success).toBe(true);

      // Second call should return cached result
      const res2 = await processRequestWithAi({
        userId: testUserId,
        userText: text,
      });
      expect(res2.success).toBe(true);
      expect(res2.cacheHit).toBe(true);
    });
  });
});
