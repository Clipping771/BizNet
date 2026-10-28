/**
 * lib/repo/notifications.ts — in-app notifications (§8.6–§8.9): list, unread count, mark read.
 */

import { prisma } from "@/lib/prisma";

export async function listNotifications(userId: string, take = 50) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}

export async function unreadNotificationCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/** Marks the given notifications (or all of the user's) as read; never touches other users' rows. */
export async function markNotificationsRead(userId: string, ids?: string[]) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return result.count;
}
