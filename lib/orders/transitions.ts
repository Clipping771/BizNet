/**
 * lib/orders/transitions.ts
 *
 * Order State Machine Transitions (§8.9, F4, F5)
 * Single source of truth for all order status transitions.
 *
 * State Table:
 * From       | To         | Who                    | Preconditions / effects
 * CONFIRMED  | DISPATCHED | supplier member        | sets dispatchedAt
 * CONFIRMED  | CANCELLED  | buyer or supplier      | reason required; cancelledBySide
 * DISPATCHED | DELIVERED  | supplier member        | sets deliveredAt
 * DISPATCHED | DISPUTED   | buyer or supplier      | reason required; auto-creates Report
 * DELIVERED  | COMPLETED  | buyer member or SYSTEM | sets completedAt; opens feedback
 * DELIVERED  | DISPUTED   | buyer member           | reason required; auto-creates Report
 * DISPUTED   | COMPLETED  | ADMIN only             | disputeResolution = RESOLVED_COMPLETED, note required
 * DISPUTED   | CANCELLED  | ADMIN only             | disputeResolution = RESOLVED_CANCELLED, note required
 * COMPLETED / CANCELLED | — | nobody               | terminal
 */

import { OrderStatus, DisputeResolution } from "@prisma/client";

export type OrderActorSide = "BUYER" | "SUPPLIER" | "ADMIN" | "SYSTEM";

export class OrderTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderTransitionError";
  }
}

export interface TransitionContext {
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  actorSide: OrderActorSide;
  actorUserId?: string | null;
  reason?: string | null;
  disputeResolution?: DisputeResolution | null;
  disputeNote?: string | null;
  now?: Date;
}

export interface TransitionResult {
  updatedFields: {
    status: OrderStatus;
    dispatchedAt?: Date | null;
    deliveredAt?: Date | null;
    completedAt?: Date | null;
    cancelledAt?: Date | null;
    cancelledBySide?: string | null;
    cancelReason?: string | null;
    disputedAt?: Date | null;
    disputeReason?: string | null;
    disputeResolution?: DisputeResolution | null;
    disputeResolvedAt?: Date | null;
    disputeNote?: string | null;
  };
  statusChangeRecord: {
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    actorUserId?: string | null;
    actorSide: OrderActorSide;
    reason?: string | null;
  };
  shouldCreateReport?: {
    targetType: "ORDER";
    reason: string;
    details?: string;
  };
}

/**
 * Validates and executes an order state transition.
 * Throws OrderTransitionError if the transition is illegal or preconditions are not met.
 */
export function validateOrderTransition(ctx: TransitionContext): TransitionResult {
  const { fromStatus, toStatus, actorSide, actorUserId, reason, disputeResolution, disputeNote } = ctx;
  const now = ctx.now || new Date();

  // Terminal states cannot transition to anything
  if (fromStatus === OrderStatus.COMPLETED || fromStatus === OrderStatus.CANCELLED) {
    throw new OrderTransitionError(`Cannot transition from terminal state ${fromStatus}`);
  }

  // Same status transition is a no-op / illegal
  if (fromStatus === toStatus) {
    throw new OrderTransitionError(`Order is already in status ${fromStatus}`);
  }

  // 1. CONFIRMED -> DISPATCHED
  if (fromStatus === OrderStatus.CONFIRMED && toStatus === OrderStatus.DISPATCHED) {
    if (actorSide !== "SUPPLIER" && actorSide !== "ADMIN") {
      throw new OrderTransitionError("Only supplier can mark order as dispatched");
    }
    return {
      updatedFields: {
        status: OrderStatus.DISPATCHED,
        dispatchedAt: now,
      },
      statusChangeRecord: {
        fromStatus,
        toStatus,
        actorUserId,
        actorSide,
        reason: reason || null,
      },
    };
  }

  // 2. CONFIRMED -> CANCELLED
  if (fromStatus === OrderStatus.CONFIRMED && toStatus === OrderStatus.CANCELLED) {
    if (actorSide !== "BUYER" && actorSide !== "SUPPLIER" && actorSide !== "ADMIN") {
      throw new OrderTransitionError("Only buyer, supplier or admin can cancel a confirmed order");
    }
    if (!reason || !reason.trim()) {
      throw new OrderTransitionError("Cancellation reason is required");
    }
    return {
      updatedFields: {
        status: OrderStatus.CANCELLED,
        cancelledAt: now,
        cancelledBySide: actorSide,
        cancelReason: reason.trim(),
      },
      statusChangeRecord: {
        fromStatus,
        toStatus,
        actorUserId,
        actorSide,
        reason: reason.trim(),
      },
    };
  }

  // 3. DISPATCHED -> DELIVERED
  if (fromStatus === OrderStatus.DISPATCHED && toStatus === OrderStatus.DELIVERED) {
    if (actorSide !== "SUPPLIER" && actorSide !== "ADMIN") {
      throw new OrderTransitionError("Only supplier can mark order as delivered");
    }
    return {
      updatedFields: {
        status: OrderStatus.DELIVERED,
        deliveredAt: now,
      },
      statusChangeRecord: {
        fromStatus,
        toStatus,
        actorUserId,
        actorSide,
        reason: reason || null,
      },
    };
  }

  // 4. DISPATCHED -> DISPUTED
  if (fromStatus === OrderStatus.DISPATCHED && toStatus === OrderStatus.DISPUTED) {
    if (actorSide !== "BUYER" && actorSide !== "SUPPLIER" && actorSide !== "ADMIN") {
      throw new OrderTransitionError("Only buyer, supplier or admin can dispute a dispatched order");
    }
    if (!reason || !reason.trim()) {
      throw new OrderTransitionError("Dispute reason is required");
    }
    return {
      updatedFields: {
        status: OrderStatus.DISPUTED,
        disputedAt: now,
        disputeReason: reason.trim(),
      },
      statusChangeRecord: {
        fromStatus,
        toStatus,
        actorUserId,
        actorSide,
        reason: reason.trim(),
      },
      shouldCreateReport: {
        targetType: "ORDER",
        reason: "ORDER_DISPUTED",
        details: reason.trim(),
      },
    };
  }

  // 5. DELIVERED -> COMPLETED
  if (fromStatus === OrderStatus.DELIVERED && toStatus === OrderStatus.COMPLETED) {
    if (actorSide !== "BUYER" && actorSide !== "SYSTEM" && actorSide !== "ADMIN") {
      throw new OrderTransitionError("Only buyer or SYSTEM (auto-complete) can mark order as completed");
    }
    return {
      updatedFields: {
        status: OrderStatus.COMPLETED,
        completedAt: now,
      },
      statusChangeRecord: {
        fromStatus,
        toStatus,
        actorUserId,
        actorSide,
        reason: reason || (actorSide === "SYSTEM" ? "Auto-completed after 7 days" : "Buyer accepted delivery"),
      },
    };
  }

  // 6. DELIVERED -> DISPUTED
  if (fromStatus === OrderStatus.DELIVERED && toStatus === OrderStatus.DISPUTED) {
    if (actorSide !== "BUYER" && actorSide !== "ADMIN") {
      throw new OrderTransitionError("Only buyer can dispute a delivered order before completion");
    }
    if (!reason || !reason.trim()) {
      throw new OrderTransitionError("Dispute reason is required");
    }
    return {
      updatedFields: {
        status: OrderStatus.DISPUTED,
        disputedAt: now,
        disputeReason: reason.trim(),
      },
      statusChangeRecord: {
        fromStatus,
        toStatus,
        actorUserId,
        actorSide,
        reason: reason.trim(),
      },
      shouldCreateReport: {
        targetType: "ORDER",
        reason: "ORDER_DISPUTED",
        details: reason.trim(),
      },
    };
  }

  // 7. DISPUTED -> COMPLETED
  if (fromStatus === OrderStatus.DISPUTED && toStatus === OrderStatus.COMPLETED) {
    if (actorSide !== "ADMIN") {
      throw new OrderTransitionError("Only ADMIN can resolve a dispute as completed");
    }
    if (!disputeNote || !disputeNote.trim()) {
      throw new OrderTransitionError("Dispute resolution note is required");
    }
    return {
      updatedFields: {
        status: OrderStatus.COMPLETED,
        completedAt: now,
        disputeResolution: DisputeResolution.RESOLVED_COMPLETED,
        disputeResolvedAt: now,
        disputeNote: disputeNote.trim(),
      },
      statusChangeRecord: {
        fromStatus,
        toStatus,
        actorUserId,
        actorSide,
        reason: disputeNote.trim(),
      },
    };
  }

  // 8. DISPUTED -> CANCELLED
  if (fromStatus === OrderStatus.DISPUTED && toStatus === OrderStatus.CANCELLED) {
    if (actorSide !== "ADMIN") {
      throw new OrderTransitionError("Only ADMIN can resolve a dispute as cancelled");
    }
    if (!disputeNote || !disputeNote.trim()) {
      throw new OrderTransitionError("Dispute resolution note is required");
    }
    return {
      updatedFields: {
        status: OrderStatus.CANCELLED,
        cancelledAt: now,
        cancelledBySide: "ADMIN",
        cancelReason: disputeNote.trim(),
        disputeResolution: DisputeResolution.RESOLVED_CANCELLED,
        disputeResolvedAt: now,
        disputeNote: disputeNote.trim(),
      },
      statusChangeRecord: {
        fromStatus,
        toStatus,
        actorUserId,
        actorSide,
        reason: disputeNote.trim(),
      },
    };
  }

  // Any other transition is illegal
  throw new OrderTransitionError(`Illegal transition from ${fromStatus} to ${toStatus} by ${actorSide}`);
}
