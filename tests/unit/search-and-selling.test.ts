import { describe, it, expect } from "vitest";
import { parseSearchQuery, toLatinDigits } from "@/lib/search/query";
import { detectSelling } from "@/lib/discussion/selling";

describe("lib/search/query.ts (§8.13)", () => {
  it("expands Bangla/English synonyms and digits into one term each", () => {
    const q = parseSearchQuery("কাপ ২৫০");
    expect(q.terms).toHaveLength(2);
    expect(q.terms[0]).toEqual(expect.arrayContaining(["কাপ", "cup"]));
    expect(q.terms[1]).toEqual(expect.arrayContaining(["২৫০", "250"]));
    expect(q.tsquery).toContain(" & ");
    expect(q.categorySlugs).toContain("cups");
  });

  it("maps 'box' and 'বক্স' to the food boxes category", () => {
    expect(parseSearchQuery("box").categorySlugs).toEqual(["food_boxes"]);
    expect(parseSearchQuery("বক্স").terms[0]).toEqual(expect.arrayContaining(["box", "বক্স"]));
  });

  it("strips characters tsquery could interpret", () => {
    const q = parseSearchQuery("box' | ! & (cup):*");
    expect(q.tsquery).not.toMatch(/'|!/);
    expect(q.terms.flat().every((t) => /^[\p{L}\p{M}\p{N}]+$/u.test(t))).toBe(true);
  });

  it("returns no query for empty input", () => {
    expect(parseSearchQuery("   ").tsquery).toBeNull();
    expect(toLatinDigits("৭৫০")).toBe("750");
  });
});

describe("lib/discussion/selling.ts (§8.14)", () => {
  const terms = ["বিক্রি", "order now", "call for price"];

  it("flags keyword, phone and link selling attempts", () => {
    expect(detectSelling("কন্টেইনার বিক্রি করি, ভালো দাম", terms).isSelling).toBe(true);
    expect(detectSelling("Best boxes — ORDER NOW!", terms).isSelling).toBe(true);
    expect(detectSelling("ফোন দিন ০১৭১২৩৪৫৬৭৮", terms).isSelling).toBe(true);
    expect(detectSelling("see www.mypack.com", terms).isSelling).toBe(true);
  });

  it("lets ordinary questions through", () => {
    expect(detectSelling("৭৫০ মিলি কন্টেইনারে গরম খাবার কতক্ষণ ভালো থাকে?", terms).isSelling).toBe(false);
    expect(detectSelling("How many kg can a 100 gsm kraft bag hold?", terms).isSelling).toBe(false);
  });
});
