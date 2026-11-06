/**
 * lib/repo/algo.ts
 *
 * Repository for algorithmic buyer signals, interaction events, and listing candidates.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function fetchBuyerInteractionEvents(
  conditions: Array<{ userId?: string; businessId?: string }>,
  since: Date
) {
  return prisma.event.findMany({
    where: {
      OR: conditions,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function fetchBuyerCompletedOrders(businessId: string, since: Date) {
  return prisma.order.findMany({
    where: {
      buyerBusinessId: businessId,
      status: "COMPLETED",
      createdAt: { gte: since },
    },
    select: {
      completedAt: true,
      createdAt: true,
      quote: {
        select: {
          request: {
            select: {
              category: { select: { slug: true } },
              repeatOfRequestId: true,
            },
          },
        },
      },
    },
  });
}

export async function fetchBuyerRequests(businessId: string, since: Date) {
  return prisma.request.findMany({
    where: {
      buyerBusinessId: businessId,
      createdAt: { gte: since },
    },
    select: {
      category: { select: { slug: true } },
      createdAt: true,
    },
    take: 20,
  });
}

export async function fetchRecommendationCandidates(whereClause: Prisma.ListingWhereInput) {
  return prisma.listing.findMany({
    where: whereClause,
    take: 60,
    orderBy: { createdAt: "desc" },
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
      business: {
        select: {
          id: true,
          name: true,
          slug: true,
          businessType: true,
          area: true,
          city: true,
          deliveryAreas: true,
          verificationStatus: true,
        },
      },
    },
  });
}
