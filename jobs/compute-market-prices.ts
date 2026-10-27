/**
 * jobs/compute-market-prices.ts
 *
 * Nightly market prices from real quotes of the last 30 days (§8.15).
 * Eligible quotes match every comparable field the request specified (spec known) and are
 * complete; they are grouped by category + spec subset + unit + quantity band + delivery
 * included + area, then summarised by lib/pricing/compute.ts. Every group is stored (with
 * isPublishable) as one batch sharing the same computedAt.
 */

import { Prisma } from "@prisma/client";
import { getSetting } from "@/lib/settings";
import { computeGroupStats, quantityBand, specKeyFor, type PriceSample } from "@/lib/pricing/compute";
import { loadPricingQuotes, saveSnapshotBatch, type PricingQuote } from "@/lib/repo/pricing";

const PERIOD_DAYS = 30;

export interface ComputeMarketPricesResult {
  computedAt: Date;
  groups: number;
  publishable: number;
  eligibleQuotes: number;
  excludedQuotes: number;
}

interface Group {
  categoryId: string;
  specKey: string;
  specLabel: Record<string, unknown>;
  unit: string;
  quantityBand: string;
  deliveryIncluded: boolean;
  area: string;
  samples: PriceSample[];
}

function groupFor(q: PricingQuote): Omit<Group, "samples"> | null {
  const fields: Array<{ key: string; comparable?: boolean }> = ((q.request.category.attributeSchema as any)?.fields as any[]) || [];
  const comparable = fields.filter((f) => f.comparable).map((f) => f.key);
  const attributes = (q.request.attributes as Record<string, unknown>) || {};
  const spec = specKeyFor(q.request.category.slug, attributes, comparable);
  if (!spec) return null;

  // Every comparable field the buyer specified must be confirmed MATCH by the supplier
  const match = (q.specMatch as Record<string, unknown>) || {};
  if (Object.keys(spec.specLabel).some((key) => match[key] !== "MATCH")) return null;

  // Complete: positive unit price and quantity; delivery charge recorded (0 = included)
  if (!(Number(q.unitPrice) > 0) || !(Number(q.quantity) > 0) || q.deliveryCharge === null) return null;

  return {
    categoryId: q.request.category.id,
    specKey: spec.specKey,
    specLabel: spec.specLabel,
    unit: q.request.unit,
    quantityBand: quantityBand(Number(q.quantity)),
    deliveryIncluded: Number(q.deliveryCharge) === 0,
    area: q.request.deliveryArea,
  };
}

export async function runComputeMarketPricesJob(now: Date = new Date()): Promise<ComputeMarketPricesResult> {
  const periodStart = new Date(now.getTime() - PERIOD_DAYS * 86400000);
  const minQuotes = (await getSetting("marketPriceMinQuotes")) || 8;
  const minSuppliers = (await getSetting("marketPriceMinSuppliers")) || 3;

  const quotes = await loadPricingQuotes(periodStart, now);
  const groups = new Map<string, Group>();
  let eligible = 0;
  for (const q of quotes) {
    const g = groupFor(q);
    if (!g) continue;
    eligible++;
    const key = [g.categoryId, g.specKey, g.unit, g.quantityBand, g.deliveryIncluded, g.area].join("§");
    const group = groups.get(key) ?? { ...g, samples: [] };
    group.samples.push({ quoteId: q.id, supplierId: q.supplierBusinessId, value: Number(q.unitPrice) });
    groups.set(key, group);
  }

  const computedAt = now;
  let excludedQuotes = 0;
  const rows: Prisma.MarketPriceSnapshotCreateManyInput[] = [];
  for (const g of groups.values()) {
    const stats = computeGroupStats(g.samples, { minQuotes, minSuppliers });
    excludedQuotes += stats.excludedCount;
    rows.push({
      categoryId: g.categoryId,
      specKey: g.specKey,
      specLabel: g.specLabel as Prisma.InputJsonValue,
      unit: g.unit,
      quantityBand: g.quantityBand,
      deliveryIncluded: g.deliveryIncluded,
      area: g.area,
      periodStart,
      periodEnd: now,
      sampleQuotes: stats.sampleQuotes,
      sampleSuppliers: stats.sampleSuppliers,
      p25: new Prisma.Decimal(stats.p25),
      median: new Prisma.Decimal(stats.median),
      p75: new Prisma.Decimal(stats.p75),
      excludedCount: stats.excludedCount,
      isPublishable: stats.isPublishable,
      computedAt,
    });
  }
  await saveSnapshotBatch(rows);

  return {
    computedAt,
    groups: rows.length,
    publishable: rows.filter((r) => r.isPublishable).length,
    eligibleQuotes: eligible,
    excludedQuotes,
  };
}
