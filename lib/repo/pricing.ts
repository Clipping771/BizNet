/**
 * lib/repo/pricing.ts
 *
 * Data access for market prices (§8.15): eligible quotes for the nightly job, snapshot
 * batches, public reads and admin exclusions (audited).
 */

import { Prisma, QuoteSource, QuoteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

/**
 * Quotes that may feed prices: supplier-sourced, not withdrawn, from non-suspended suppliers,
 * not manually excluded. REJECTED here means "not chosen by the buyer" (still a real price);
 * fraudulent quotes are removed through MarketPriceExclusion.
 */
export async function loadPricingQuotes(since: Date, until: Date) {
  return prisma.quote.findMany({
    where: {
      createdAt: { gte: since, lte: until },
      source: QuoteSource.SUPPLIER,
      status: { in: [QuoteStatus.SUBMITTED, QuoteStatus.REVISED, QuoteStatus.ACCEPTED, QuoteStatus.REJECTED] },
      supplierBusiness: { isSuspended: false, deletedAt: null },
      priceExclusions: { none: {} },
    },
    select: {
      id: true,
      supplierBusinessId: true,
      unitPrice: true,
      quantity: true,
      deliveryCharge: true,
      specMatch: true,
      request: {
        select: {
          attributes: true,
          unit: true,
          deliveryArea: true,
          category: { select: { id: true, slug: true, attributeSchema: true } },
        },
      },
    },
  });
}

export type PricingQuote = Awaited<ReturnType<typeof loadPricingQuotes>>[number];

export async function saveSnapshotBatch(rows: Prisma.MarketPriceSnapshotCreateManyInput[]) {
  if (rows.length === 0) return 0;
  const result = await prisma.marketPriceSnapshot.createMany({ data: rows });
  return result.count;
}

/** Snapshots of the most recent job run; publishable only unless `all`. */
export async function latestSnapshots(opts: { all?: boolean } = {}) {
  const latest = await prisma.marketPriceSnapshot.aggregate({ _max: { computedAt: true } });
  const computedAt = latest._max.computedAt;
  if (!computedAt) return [];
  return prisma.marketPriceSnapshot.findMany({
    where: { computedAt, ...(opts.all ? {} : { isPublishable: true }) },
    include: { category: { select: { slug: true, sortOrder: true } } },
    orderBy: [{ category: { sortOrder: "asc" } }, { specKey: "asc" }, { quantityBand: "asc" }],
  });
}

export async function createPriceExclusion(input: { adminUserId: string; quoteId: string; reason: string }) {
  const quote = await prisma.quote.findUnique({ where: { id: input.quoteId }, select: { id: true } });
  if (!quote) throw new Error("Quote not found");
  const exclusion = await prisma.marketPriceExclusion.upsert({
    where: { quoteId: input.quoteId },
    update: { reason: input.reason },
    create: { quoteId: input.quoteId, reason: input.reason, createdByUserId: input.adminUserId },
  });
  await logAudit({
    actorUserId: input.adminUserId,
    action: "MARKET_PRICE_EXCLUSION",
    entityType: "QUOTE",
    entityId: input.quoteId,
    after: { reason: input.reason },
  });
  return exclusion;
}

export async function listPriceExclusions() {
  return prisma.marketPriceExclusion.findMany({
    include: {
      quote: { select: { id: true, unitPrice: true, supplierBusiness: { select: { name: true } }, request: { select: { code: true } } } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
