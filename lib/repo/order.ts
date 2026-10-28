/**
 * lib/repo/order.ts
 *
 * Repository for Orders, Order Status Transitions and Reliability Feedback (§8.9, §8.10, F11, F12).
 */

import { prisma } from "@/lib/prisma";
import { OrderStatus, RequestOutcome, DisputeResolution } from "@prisma/client";
import {
  validateOrderTransition,
  type OrderActorSide,
} from "@/lib/orders/transitions";
import { logAudit } from "@/lib/audit";
import { logEvent } from "@/lib/events";

export interface UpdateOrderStatusInput {
  orderId: string;
  toStatus: OrderStatus;
  actorUserId?: string | null;
  actorSide: OrderActorSide;
  reason?: string | null;
  disputeResolution?: DisputeResolution | null;
  disputeNote?: string | null;
}

export interface SubmitFeedbackInput {
  orderId: string;
  userId: string;
  buyerBusinessId: string;
  onTime?: boolean | null;
  quantityCorrect?: boolean | null;
  matchedSpec?: boolean | null;
  hadIssue?: boolean;
  issueResolved?: boolean | null;
  note?: string | null;
}

export async function findOrderByCode(code: string) {
  return prisma.order.findUnique({
    where: { code },
    include: {
      request: {
        include: {
          category: true,
        },
      },
      quote: {
        include: {
          supplierBusiness: true,
        },
      },
      buyerBusiness: true,
      supplierBusiness: true,
      feedback: true,
      statusHistory: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function findOrderById(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      request: {
        include: {
          category: true,
        },
      },
      quote: {
        include: {
          supplierBusiness: true,
        },
      },
      buyerBusiness: true,
      supplierBusiness: true,
      feedback: true,
      statusHistory: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function updateOrderStatusRecord(input: UpdateOrderStatusInput) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      request: true,
      buyerBusiness: true,
      supplierBusiness: true,
    },
  });

  if (!order) {
    throw new Error("Order not found");
  }

  // 1. Validate transition via state machine (§8.9, F4)
  const validation = validateOrderTransition({
    fromStatus: order.status,
    toStatus: input.toStatus,
    actorSide: input.actorSide,
    actorUserId: input.actorUserId,
    reason: input.reason,
    disputeResolution: input.disputeResolution,
    disputeNote: input.disputeNote,
    now: new Date(),
  });

  // 2. Execute DB updates atomically in a transaction
  const updatedOrder = await prisma.$transaction(async (tx) => {
    // Update order only if nobody changed its status since we read it (no double transitions)
    const changed = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: validation.updatedFields,
    });
    if (changed.count !== 1) {
      throw new Error("Order status changed meanwhile; reload and try again");
    }
    const updated = await tx.order.findUniqueOrThrow({ where: { id: order.id } });

    // Record status change
    await tx.orderStatusChange.create({
      data: {
        orderId: order.id,
        fromStatus: validation.statusChangeRecord.fromStatus,
        toStatus: validation.statusChangeRecord.toStatus,
        actorUserId: validation.statusChangeRecord.actorUserId,
        actorSide: validation.statusChangeRecord.actorSide,
        reason: validation.statusChangeRecord.reason,
      },
    });

    // Auto-create Report on Dispute (§8.9, F5)
    if (validation.shouldCreateReport) {
      await tx.report.create({
        data: {
          reporterUserId: input.actorUserId || order.buyerBusinessId,
          targetType: validation.shouldCreateReport.targetType,
          targetId: order.id,
          reason: validation.shouldCreateReport.reason,
          details: validation.shouldCreateReport.details,
        },
      });
    }

    // Update Request outcome when order finishes (§8.9, F5, F6)
    if (input.toStatus === OrderStatus.COMPLETED) {
      await tx.request.update({
        where: { id: order.requestId },
        data: { outcome: RequestOutcome.ORDER_COMPLETED },
      });
    } else if (input.toStatus === OrderStatus.CANCELLED) {
      const outcome =
        input.actorSide === "ADMIN" && order.status === OrderStatus.DISPUTED
          ? RequestOutcome.ORDER_DISPUTE_CLOSED
          : RequestOutcome.ORDER_CANCELLED;
      await tx.request.update({
        where: { id: order.requestId },
        data: { outcome },
      });
    }

    return updated;
  });

  // Tell the other side of the deal (and both sides when an admin decides)
  const notifyBusinesses =
    input.actorSide === "BUYER" ? [order.supplierBusinessId] : input.actorSide === "SUPPLIER" ? [order.buyerBusinessId] : [order.buyerBusinessId, order.supplierBusinessId];
  const members = await prisma.membership.findMany({ where: { businessId: { in: notifyBusinesses } }, select: { userId: true } });
  if (members.length > 0) {
    await prisma.notification.createMany({
      data: members.map((m) => ({
        userId: m.userId,
        type: "ORDER_STATUS",
        params: { orderCode: order.code, status: input.toStatus },
        link: `/orders/${order.code}`,
      })),
    });
  }

  // 3. Log Audit & Event
  await logAudit({
    actorUserId: input.actorUserId,
    actorBusinessId:
      input.actorSide === "BUYER"
        ? order.buyerBusinessId
        : input.actorSide === "SUPPLIER"
        ? order.supplierBusinessId
        : null,
    action: `ORDER_STATUS_${input.toStatus}`,
    entityType: "ORDER",
    entityId: order.id,
    before: { status: order.status },
    after: { status: input.toStatus, reason: input.reason },
  });

  await logEvent({
    name: "order_status_changed",
    userId: input.actorUserId,
    props: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: input.toStatus,
      actorSide: input.actorSide,
    },
  });

  return updatedOrder;
}

/**
 * Reliability feedback (§8.10, G, F12).
 * Optional 2-3 tap feedback submitted after order completion.
 */
export async function submitReliabilityFeedbackRecord(input: SubmitFeedbackInput) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
  });

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.buyerBusinessId !== input.buyerBusinessId) {
    throw new Error("IDOR: Only buyer can submit feedback for this order");
  }

  if (order.status !== OrderStatus.COMPLETED) {
    throw new Error("Feedback can only be given on completed orders");
  }

  const feedback = await prisma.reliabilityFeedback.upsert({
    where: { orderId: input.orderId },
    update: {
      onTime: input.onTime ?? null,
      quantityCorrect: input.quantityCorrect ?? null,
      matchedSpec: input.matchedSpec ?? null,
      hadIssue: input.hadIssue ?? false,
      issueResolved: input.issueResolved ?? null,
      note: input.note ?? null,
      createdByUserId: input.userId,
    },
    create: {
      orderId: input.orderId,
      onTime: input.onTime ?? null,
      quantityCorrect: input.quantityCorrect ?? null,
      matchedSpec: input.matchedSpec ?? null,
      hadIssue: input.hadIssue ?? false,
      issueResolved: input.issueResolved ?? null,
      note: input.note ?? null,
      createdByUserId: input.userId,
    },
  });

  await logAudit({
    actorUserId: input.userId,
    actorBusinessId: input.buyerBusinessId,
    action: "FEEDBACK_GIVEN",
    entityType: "ORDER",
    entityId: input.orderId,
    after: { onTime: feedback.onTime, quantityCorrect: feedback.quantityCorrect, matchedSpec: feedback.matchedSpec, hadIssue: feedback.hadIssue },
  });

  await logEvent({
    name: "feedback_given",
    userId: input.userId,
    businessId: input.buyerBusinessId,
    props: {
      orderId: input.orderId,
      supplierBusinessId: order.supplierBusinessId,
      onTime: input.onTime,
      quantityCorrect: input.quantityCorrect,
      matchedSpec: input.matchedSpec,
      hadIssue: input.hadIssue,
    },
  });

  return feedback;
}

/**
 * Private reliability counts per supplier for the comparison table (§8.10):
 * shown only when a supplier has at least `minFeedbacks` feedbacks.
 */
export async function getReliabilitySummaries(supplierBusinessIds: string[], minFeedbacks: number) {
  const feedbacks = await prisma.reliabilityFeedback.findMany({
    where: { order: { supplierBusinessId: { in: supplierBusinessIds } } },
    select: { onTime: true, order: { select: { supplierBusinessId: true } } },
  });
  const result: Record<string, { feedbackCount: number; onTimeCount: number; onTimeAnswered: number } | null> = {};
  for (const id of supplierBusinessIds) {
    const own = feedbacks.filter((f) => f.order.supplierBusinessId === id);
    const answered = own.filter((f) => f.onTime !== null);
    result[id] =
      own.length >= minFeedbacks
        ? {
            feedbackCount: own.length,
            onTimeCount: answered.filter((f) => f.onTime).length,
            onTimeAnswered: answered.length,
          }
        : null;
  }
  return result;
}

export async function listOrdersForBusiness(businessId: string) {
  return prisma.order.findMany({
    where: {
      OR: [{ buyerBusinessId: businessId }, { supplierBusinessId: businessId }],
    },
    include: {
      buyerBusiness: { select: { id: true, name: true, area: true } },
      supplierBusiness: { select: { id: true, name: true, area: true } },
      request: { select: { id: true, code: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
