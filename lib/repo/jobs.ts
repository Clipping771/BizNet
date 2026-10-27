/**
 * lib/repo/jobs.ts
 *
 * Repository functions for background workers and schedulers (§8.5, §8.6, §8.9)
 */

import { prisma } from "@/lib/prisma";
import { OrderStatus, RequestStatus, RequestOutcome, QuoteStatus } from "@prisma/client";

export async function findOrdersToAutoComplete(cutoff: Date) {
  return prisma.order.findMany({
    where: {
      status: OrderStatus.DELIVERED,
      deliveredAt: { lte: cutoff },
    },
  });
}

export async function findRequestsToExpire(now: Date) {
  return prisma.request.findMany({
    where: {
      status: RequestStatus.OPEN,
      closesAt: { lte: now },
    },
    include: {
      quotes: {
        where: {
          status: { in: [QuoteStatus.SUBMITTED, QuoteStatus.REVISED] },
        },
      },
    },
  });
}

export async function closeRequestWithQuotes(requestId: string) {
  return prisma.request.update({
    where: { id: requestId },
    data: { status: RequestStatus.CLOSED },
  });
}

export async function expireRequestWithoutQuotes(requestId: string) {
  return prisma.request.update({
    where: { id: requestId },
    data: {
      status: RequestStatus.EXPIRED,
      outcome: RequestOutcome.NONE,
    },
  });
}

export async function findRequestForMatching(requestId: string) {
  return prisma.request.findUnique({
    where: { id: requestId },
    include: {
      category: true,
      buyerBusiness: true,
    },
  });
}
