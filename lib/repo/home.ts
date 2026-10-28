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
