import { describe, it, expect } from "vitest";
import { computeGroupStats, percentile, quantityBand, specKeyFor, type PriceSample } from "@/lib/pricing/compute";

const opts = { minQuotes: 8, minSuppliers: 3 };
const sample = (quoteId: string, supplierId: string, value: number): PriceSample => ({ quoteId, supplierId, value });

describe("lib/pricing/compute.ts (§8.15)", () => {
  it("computes linear-interpolation percentiles", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(percentile([7], 0.75)).toBe(7);
  });

  it("publishes a clean group with ≥ 8 quotes from ≥ 3 suppliers", () => {
    const values = [8.6, 8.8, 9.1, 8.9, 9.2, 8.7, 9.0, 9.0, 8.5, 9.0];
    const stats = computeGroupStats(
      values.map((v, i) => sample(`q${i}`, `s${i % 5}`, v)),
      opts
    );
    expect(stats.isPublishable).toBe(true);
    expect(stats.excludedCount).toBe(0);
    expect(stats.sampleQuotes).toBe(10);
    expect(stats.sampleSuppliers).toBe(5);
    expect(stats.median).toBe(8.95);
  });

  it("excludes and counts an injected extreme quote", () => {
    const values = [8.6, 8.8, 9.1, 8.9, 9.2, 8.7, 9.0, 8.5, 9.0];
    const samples = values.map((v, i) => sample(`q${i}`, `s${i % 4}`, v));
    samples.push(sample("extreme", "s9", 95));
    const stats = computeGroupStats(samples, opts);
    expect(stats.excludedQuoteIds).toContain("extreme");
    expect(stats.excludedCount).toBe(1);
    expect(stats.p75).toBeLessThan(10);
    expect(stats.isPublishable).toBe(true);
  });

  it("does not let a supplier with > 40% of quotes dominate the median", () => {
    // 6 of 10 quotes from one cheap supplier
    const samples = [
      ...[5, 5, 5, 5, 5, 5].map((v, i) => sample(`d${i}`, "dominant", v)),
      sample("a", "s1", 9),
      sample("b", "s2", 9.2),
      sample("c", "s3", 8.8),
      sample("e", "s4", 9.1),
    ];
    const naiveMedian = 5;
    const stats = computeGroupStats(samples, opts);
    expect(stats.median).not.toBe(naiveMedian);
    expect(stats.median).toBeGreaterThan(8);
    // the dominant supplier is kept once (5 of its quotes excluded); its single remaining
    // value may then also fall outside the IQR fences
    expect(stats.excludedQuoteIds.filter((id) => id.startsWith("d")).length).toBeGreaterThanOrEqual(5);
    expect(stats.sampleQuotes).toBeLessThan(8);
    expect(stats.isPublishable).toBe(false);
  });

  it("is not publishable below the supplier minimum", () => {
    const samples = Array.from({ length: 9 }, (_, i) => sample(`q${i}`, i % 2 ? "s1" : "s2", 9 + i * 0.01));
    expect(computeGroupStats(samples, opts).isPublishable).toBe(false);
  });

  it("bands quantities and builds a canonical spec key from comparable fields only", () => {
    expect(quantityBand(50)).toBe("1-99");
    expect(quantityBand(500)).toBe("500-999");
    expect(quantityBand(1200)).toBe("1000-4999");
    const a = specKeyFor("containers", { material: "plastic_pp", capacity_ml: 750, colour: "red" }, ["capacity_ml", "material"]);
    const b = specKeyFor("containers", { capacity_ml: 750, material: "plastic_pp" }, ["material", "capacity_ml"]);
    expect(a?.specKey).toBe(b?.specKey);
    expect(a?.specLabel).toEqual({ capacity_ml: 750, material: "plastic_pp" });
    expect(specKeyFor("containers", {}, ["material"])).toBeNull();
  });
});
