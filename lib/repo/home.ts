/**
 * lib/repo/home.ts — the logged-in home summary: what needs attention for the active business.
 */

import { prisma } from "@/lib/prisma";

export async function homeSummary(userId: string, businessId: string | null) {
  const unreadNotifications = await prisma.notification.count({ where: { userId, readAt: null } });
  if (!businessId) return { openRequests: 0, activeOrders: 0, unreadMessages: 0, unreadNotifications, recentRequests: [] };
  const [openRequests, activeOrders, unreadMessages, recentRequests] = await Promise.all([
    prisma.request.count({ where: { buyerBusinessId: businessId, status: "OPEN" } }),
    prisma.order.count({
      where: {
        OR: [{ buyerBusinessId: businessId }, { supplierBusinessId: businessId }],
        status: { in: ["CONFIRMED", "DISPATCHED", "DELIVERED", "DISPUTED"] },
      },
    }),
    prisma.message.count({
      where: {
        readAt: null,
        senderBusinessId: { not: businessId },
        conversation: { OR: [{ buyerBusinessId: businessId }, { supplierBusinessId: businessId }] },
      },
    }),
    prisma.request.findMany({
      where: { buyerBusinessId: businessId },
      select: { code: true, title: true, status: true, _count: { select: { quotes: true } } },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);
  return { openRequests, activeOrders, unreadMessages, unreadNotifications, recentRequests };
}

/** Newest verified suppliers for the home rail; one row per name so duplicate sign-ups do not repeat. */
export async function getTopVerifiedSuppliers(take = 4) {
  const rows = await prisma.business.findMany({
    where: { isSupplier: true, verificationStatus: "VERIFIED", isSuspended: false, deletedAt: null },
    take: take * 3,
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true, name: true, area: true, city: true, businessType: true },
  });
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.name.toLowerCase()) && seen.add(r.name.toLowerCase())).slice(0, take);
}

export async function getBusinessHomeStats(businessId: string) {
  const [openRequests, totalQuotes, activeOrders] = await Promise.all([
    prisma.request.count({ where: { buyerBusinessId: businessId, status: "OPEN" } }),
    prisma.quote.count({ where: { request: { buyerBusinessId: businessId } } }),
    prisma.order.count({
      where: {
        buyerBusinessId: businessId,
        status: { in: ["CONFIRMED", "DISPATCHED", "DELIVERED"] },
      },
    }),
  ]);
  return { openRequests, totalQuotes, activeOrders };
}

/** Newest public listings (same visibility rules as the public listing page) for the home feed. */
export async function listRecentPublicListings(take = 6) {
  return prisma.listing.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      business: { isSuspended: false, deletedAt: null, isSupplier: true, verificationStatus: { in: ["BASIC", "VERIFIED"] } },
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      title: true,
      unit: true,
      priceMin: true,
      priceMax: true,
      currency: true,
      moq: true,
      leadTimeDays: true,
      imageKeys: true,
      createdAt: true,
      category: { select: { slug: true } },
      business: { select: { id: true, name: true, slug: true, businessType: true, area: true, city: true, verificationStatus: true } },
    },
  });
}

/**
 * Latest publishable price groups with the medians of their earlier nightly runs, so the home rail can
 * draw a real trend line. Groups with a single run return a one-point history (no trend shown).
 */
export async function priceTrends(take = 4) {
  const latest = await prisma.marketPriceSnapshot.aggregate({ _max: { computedAt: true } });
  const computedAt = latest._max.computedAt;
  if (!computedAt) return [];
  const groups = await prisma.marketPriceSnapshot.findMany({
    where: { computedAt, isPublishable: true },
    include: { category: { select: { slug: true, sortOrder: true } } },
    orderBy: [{ category: { sortOrder: "asc" } }, { sampleQuotes: "desc" }],
    take,
  });
  return Promise.all(
    groups.map(async (g) => {
      const history = await prisma.marketPriceSnapshot.findMany({
        where: {
          categoryId: g.categoryId,
          specKey: g.specKey,
          unit: g.unit,
          currency: g.currency,
          quantityBand: g.quantityBand,
          deliveryIncluded: g.deliveryIncluded,
          area: g.area,
          isPublishable: true,
        },
        orderBy: { computedAt: "desc" },
        take: 8,
        select: { median: true },
      });
      return {
        id: g.id,
        categorySlug: g.category.slug,
        unit: g.unit,
        currency: g.currency,
        median: Number(g.median),
        sampleQuotes: g.sampleQuotes,
        history: history.map((h) => Number(h.median)).reverse(),
      };
    })
  );
}

/**
 * What the desk home needs in one call: records that wait on this business, plus the two tables.
 * Each list is scoped to the active business, so a row only appears for a party to it.
 */
export async function deskData(businessId: string) {
  const [quotesToCompare, orders, unreadMessages, quotesReceived, openRequests] = await Promise.all([
    prisma.request.findMany({
      where: { buyerBusinessId: businessId, status: "OPEN", quotes: { some: { status: { in: ["SUBMITTED", "REVISED"] } } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { code: true, title: true, _count: { select: { quotes: { where: { status: { in: ["SUBMITTED", "REVISED"] } } } } } },
    }),
    prisma.order.findMany({
      where: {
        OR: [{ buyerBusinessId: businessId }, { supplierBusinessId: businessId }],
        status: { in: ["PENDING_CONFIRMATION", "CONFIRMED", "DISPATCHED", "DELIVERED", "DISPUTED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        code: true,
        status: true,
        buyerBusinessId: true,
        buyerConfirmedAt: true,
        supplierConfirmedAt: true,
        expectedDeliveryAt: true,
        createdAt: true,
        request: { select: { title: true } },
        buyerBusiness: { select: { name: true } },
        supplierBusiness: { select: { name: true } },
      },
    }),
    prisma.message.count({
      where: {
        readAt: null,
        senderBusinessId: { not: businessId },
        conversation: { OR: [{ buyerBusinessId: businessId }, { supplierBusinessId: businessId }] },
      },
    }),
    prisma.quote.count({ where: { request: { buyerBusinessId: businessId }, status: { in: ["SUBMITTED", "REVISED", "ACCEPTED"] } } }),
    prisma.request.count({ where: { buyerBusinessId: businessId, status: "OPEN" } }),
  ]);
  return { quotesToCompare, orders, unreadMessages, quotesReceived, openRequests };
}

/** The active business's latest requests, for the requests table on the desk. */
export async function listMyRecentRequests(businessId: string, take = 6) {
  return prisma.request.findMany({
    where: { buyerBusinessId: businessId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      code: true,
      title: true,
      status: true,
      quantity: true,
      unit: true,
      neededBy: true,
      createdAt: true,
      category: { select: { slug: true } },
      _count: { select: { quotes: true } },
    },
  });
}

/**
 * Past purchases to repeat, newest first and one per product. "saved" compares the order with the
 * highest other quote on that request, in the same currency; with no such quote it stays null.
 */
export async function listOrderAgain(businessId: string, take = 3) {
  const orders = await prisma.order.findMany({
    where: { buyerBusinessId: businessId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    take: 20,
    select: {
      id: true,
      code: true,
      snapshot: true,
      quoteId: true,
      completedAt: true,
      createdAt: true,
      supplierBusiness: { select: { name: true } },
      request: {
        select: {
          title: true,
          categoryId: true,
          quotes: { where: { status: { not: "WITHDRAWN" } }, select: { id: true, totalPrice: true, currency: true } },
        },
      },
    },
  });

  const seen = new Set<string>();
  const items = [];
  for (const order of orders) {
    const key = `${order.request.categoryId}:${order.supplierBusiness.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const snapshot = order.snapshot as { total?: string; currency?: string };
    const total = Number(snapshot?.total);
    if (!Number.isFinite(total)) continue;
    const others = order.request.quotes.filter((q) => q.id !== order.quoteId && (!snapshot.currency || q.currency === snapshot.currency)).map((q) => Number(q.totalPrice));
    const highest = others.length ? Math.max(...others) : null;
    items.push({
      id: order.id,
      code: order.code,
      title: order.request.title,
      supplier: order.supplierBusiness.name,
      completedAt: (order.completedAt ?? order.createdAt).toISOString(),
      total,
      currency: snapshot.currency,
      saved: highest !== null && highest > total ? highest - total : null,
    });
    if (items.length === take) break;
  }
  return items;
}
