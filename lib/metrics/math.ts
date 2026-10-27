/** Small, pure helpers for the metrics dashboard (§13). */

/** Percentage rounded to 1 dp; null when the denominator is 0 (shown as "—", never as 0%). */
export function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)) * 100) / 100;
}

export function round2(n: number | null): number | null {
  return n === null ? null : Math.round(n * 100) / 100;
}

export type ThresholdStatus = "green" | "red" | "none";

/** Green when value ≥ min (and ≤ max if given); "none" when there is no value. */
export function thresholdStatus(value: number | null, min: number, max?: number): ThresholdStatus {
  if (value === null) return "none";
  return value >= min && (max === undefined || value <= max) ? "green" : "red";
}
