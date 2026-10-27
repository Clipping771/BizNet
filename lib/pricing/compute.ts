/**
 * lib/pricing/compute.ts
 *
 * Pure market-price statistics (§8.15), table-tested:
 * - a supplier contributing > 40% of a group's quotes is collapsed to its median, kept once;
 * - values outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR] are excluded;
 * - every excluded quote is counted;
 * - publishable only with ≥ minQuotes quotes from ≥ minSuppliers suppliers.
 */

export interface PriceSample {
  quoteId: string;
  supplierId: string;
  /** Unit price per the request's unit, BDT. */
  value: number;
}

export interface GroupStats {
  p25: number;
  median: number;
  p75: number;
  sampleQuotes: number;
  sampleSuppliers: number;
  excludedCount: number;
  excludedQuoteIds: string[];
  isPublishable: boolean;
}

export const MAX_SUPPLIER_SHARE = 0.4;

/** Linear-interpolation percentile (same as PERCENTILE_CONT) on a sorted array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function computeGroupStats(samples: PriceSample[], opts: { minQuotes: number; minSuppliers: number }): GroupStats {
  const excluded: string[] = [];

  // 1. Dominant suppliers: > 40% of the group's quotes → one sample at that supplier's median
  const bySupplier = new Map<string, PriceSample[]>();
  for (const s of samples) bySupplier.set(s.supplierId, [...(bySupplier.get(s.supplierId) ?? []), s]);
  let kept: PriceSample[] = [];
  for (const [supplierId, own] of bySupplier) {
    if (samples.length > 1 && own.length / samples.length > MAX_SUPPLIER_SHARE && own.length > 1) {
      const sorted = own.map((s) => s.value).sort((a, b) => a - b);
      kept.push({ quoteId: own[0].quoteId, supplierId, value: percentile(sorted, 0.5) });
      excluded.push(...own.slice(1).map((s) => s.quoteId));
    } else {
      kept.push(...own);
    }
  }

  // 2. IQR fences
  if (kept.length >= 4) {
    const sorted = kept.map((s) => s.value).sort((a, b) => a - b);
    const q1 = percentile(sorted, 0.25);
    const q3 = percentile(sorted, 0.75);
    const iqr = q3 - q1;
    const low = q1 - 1.5 * iqr;
    const high = q3 + 1.5 * iqr;
    const inside = kept.filter((s) => s.value >= low && s.value <= high);
    excluded.push(...kept.filter((s) => s.value < low || s.value > high).map((s) => s.quoteId));
    kept = inside;
  }

  const values = kept.map((s) => s.value).sort((a, b) => a - b);
  const sampleSuppliers = new Set(kept.map((s) => s.supplierId)).size;
  return {
    p25: round4(percentile(values, 0.25)),
    median: round4(percentile(values, 0.5)),
    p75: round4(percentile(values, 0.75)),
    sampleQuotes: kept.length,
    sampleSuppliers,
    excludedCount: excluded.length,
    excludedQuoteIds: excluded,
    isPublishable: kept.length >= opts.minQuotes && sampleSuppliers >= opts.minSuppliers,
  };
}

/** Quantity bands used to group comparable orders. */
export function quantityBand(quantity: number): string {
  if (quantity < 100) return "1-99";
  if (quantity < 500) return "100-499";
  if (quantity < 1000) return "500-999";
  if (quantity < 5000) return "1000-4999";
  return "5000+";
}

/**
 * Canonical spec subset: the request's values for the category's comparable fields,
 * sorted by key. Returns null when the request specifies none (spec unknown).
 */
export function specKeyFor(
  categorySlug: string,
  attributes: Record<string, unknown>,
  comparableKeys: string[]
): { specKey: string; specLabel: Record<string, unknown> } | null {
  const label: Record<string, unknown> = {};
  for (const key of [...comparableKeys].sort()) {
    const value = attributes?.[key];
    if (value !== undefined && value !== null && value !== "") label[key] = value;
  }
  const keys = Object.keys(label);
  if (keys.length === 0) return null;
  return { specKey: `${categorySlug}:${keys.map((k) => `${k}=${JSON.stringify(label[k])}`).join("|")}`, specLabel: label };
}
