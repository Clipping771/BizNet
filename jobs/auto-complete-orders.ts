/**
 * jobs/auto-complete-orders.ts
 *
 * Automatically marks DELIVERED orders as COMPLETED after 7 days (§8.9, F5).
 */

import { findOrdersToAutoComplete } from "@/lib/repo/jobs";
import { OrderStatus } from "@prisma/client";
import { updateOrderStatusRecord } from "@/lib/repo/order";

export async function runAutoCompleteOrdersJob(now: Date = new Date()) {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const eligibleOrders = await findOrdersToAutoComplete(sevenDaysAgo);

  const completedIds: string[] = [];

  for (const order of eligibleOrders) {
    try {
      await updateOrderStatusRecord({
        orderId: order.id,
        toStatus: OrderStatus.COMPLETED,
        actorSide: "SYSTEM",
        reason: "Auto-completed by system 7 days after delivery",
      });
      completedIds.push(order.id);
    } catch (err) {
      console.error(`Failed to auto-complete order ${order.code}:`, err);
    }
  }

  return {
    autoCompletedCount: completedIds.length,
    completedIds,
  };
}
