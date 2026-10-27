import { describe, it, expect } from "vitest";
import {
  validateOrderTransition,
  OrderTransitionError,
  type TransitionContext,
} from "@/lib/orders/transitions";
import { OrderStatus, DisputeResolution } from "@prisma/client";

describe("lib/orders/transitions.ts - Order State Machine Transition Table Tests (§8.9, F4)", () => {
  const fixedNow = new Date("2026-10-27T12:00:00.000Z");

  describe("Valid Transitions (§8.9 Table)", () => {
    it("CONFIRMED -> DISPATCHED by SUPPLIER sets dispatchedAt", () => {
      const res = validateOrderTransition({
        fromStatus: OrderStatus.CONFIRMED,
        toStatus: OrderStatus.DISPATCHED,
        actorSide: "SUPPLIER",
        actorUserId: "user_supp_1",
        now: fixedNow,
      });
      expect(res.updatedFields.status).toBe(OrderStatus.DISPATCHED);
      expect(res.updatedFields.dispatchedAt).toEqual(fixedNow);
      expect(res.statusChangeRecord.actorSide).toBe("SUPPLIER");
    });

    it("CONFIRMED -> CANCELLED by BUYER requires reason and sets cancelledBySide", () => {
      const res = validateOrderTransition({
        fromStatus: OrderStatus.CONFIRMED,
        toStatus: OrderStatus.CANCELLED,
        actorSide: "BUYER",
        actorUserId: "user_buyer_1",
        reason: "Supplier unable to fulfill timely",
        now: fixedNow,
      });
      expect(res.updatedFields.status).toBe(OrderStatus.CANCELLED);
      expect(res.updatedFields.cancelledBySide).toBe("BUYER");
      expect(res.updatedFields.cancelReason).toBe("Supplier unable to fulfill timely");
      expect(res.updatedFields.cancelledAt).toEqual(fixedNow);
    });

    it("DISPATCHED -> DELIVERED by SUPPLIER sets deliveredAt", () => {
      const res = validateOrderTransition({
        fromStatus: OrderStatus.DISPATCHED,
        toStatus: OrderStatus.DELIVERED,
        actorSide: "SUPPLIER",
        now: fixedNow,
      });
      expect(res.updatedFields.status).toBe(OrderStatus.DELIVERED);
      expect(res.updatedFields.deliveredAt).toEqual(fixedNow);
    });

    it("DISPATCHED -> DISPUTED by BUYER requires reason and triggers auto-report", () => {
      const res = validateOrderTransition({
        fromStatus: OrderStatus.DISPATCHED,
        toStatus: OrderStatus.DISPUTED,
        actorSide: "BUYER",
        reason: "Driver never arrived with package",
        now: fixedNow,
      });
      expect(res.updatedFields.status).toBe(OrderStatus.DISPUTED);
      expect(res.shouldCreateReport).toBeDefined();
      expect(res.shouldCreateReport?.targetType).toBe("ORDER");
      expect(res.shouldCreateReport?.details).toBe("Driver never arrived with package");
    });

    it("DELIVERED -> COMPLETED by BUYER sets completedAt", () => {
      const res = validateOrderTransition({
        fromStatus: OrderStatus.DELIVERED,
        toStatus: OrderStatus.COMPLETED,
        actorSide: "BUYER",
        now: fixedNow,
      });
      expect(res.updatedFields.status).toBe(OrderStatus.COMPLETED);
      expect(res.updatedFields.completedAt).toEqual(fixedNow);
    });

    it("DELIVERED -> COMPLETED by SYSTEM (7-day job) sets completedAt", () => {
      const res = validateOrderTransition({
        fromStatus: OrderStatus.DELIVERED,
        toStatus: OrderStatus.COMPLETED,
        actorSide: "SYSTEM",
        now: fixedNow,
      });
      expect(res.updatedFields.status).toBe(OrderStatus.COMPLETED);
      expect(res.updatedFields.completedAt).toEqual(fixedNow);
      expect(res.statusChangeRecord.actorSide).toBe("SYSTEM");
    });

    it("DISPUTED -> COMPLETED by ADMIN sets disputeResolution = RESOLVED_COMPLETED with note", () => {
      const res = validateOrderTransition({
        fromStatus: OrderStatus.DISPUTED,
        toStatus: OrderStatus.COMPLETED,
        actorSide: "ADMIN",
        disputeResolution: DisputeResolution.RESOLVED_COMPLETED,
        disputeNote: "Buyer confirmed goods arrived safely after courier investigation",
        now: fixedNow,
      });
      expect(res.updatedFields.status).toBe(OrderStatus.COMPLETED);
      expect(res.updatedFields.disputeResolution).toBe(DisputeResolution.RESOLVED_COMPLETED);
      expect(res.updatedFields.disputeNote).toBe(
        "Buyer confirmed goods arrived safely after courier investigation"
      );
    });

    it("DISPUTED -> CANCELLED by ADMIN sets disputeResolution = RESOLVED_CANCELLED with note", () => {
      const res = validateOrderTransition({
        fromStatus: OrderStatus.DISPUTED,
        toStatus: OrderStatus.CANCELLED,
        actorSide: "ADMIN",
        disputeResolution: DisputeResolution.RESOLVED_CANCELLED,
        disputeNote: "Damaged batch during transit, refund ordered",
        now: fixedNow,
      });
      expect(res.updatedFields.status).toBe(OrderStatus.CANCELLED);
      expect(res.updatedFields.disputeResolution).toBe(DisputeResolution.RESOLVED_CANCELLED);
    });
  });

  describe("Illegal Transition Table Tests (Must throw OrderTransitionError)", () => {
    const illegalCases: Array<{ name: string; ctx: TransitionContext }> = [
      {
        name: "Terminal state COMPLETED cannot transition to CANCELLED",
        ctx: { fromStatus: OrderStatus.COMPLETED, toStatus: OrderStatus.CANCELLED, actorSide: "ADMIN" },
      },
      {
        name: "Terminal state CANCELLED cannot transition to CONFIRMED",
        ctx: { fromStatus: OrderStatus.CANCELLED, toStatus: OrderStatus.CONFIRMED, actorSide: "ADMIN" },
      },
      {
        name: "Same status transition (CONFIRMED -> CONFIRMED)",
        ctx: { fromStatus: OrderStatus.CONFIRMED, toStatus: OrderStatus.CONFIRMED, actorSide: "SUPPLIER" },
      },
      {
        name: "BUYER cannot dispatch order (CONFIRMED -> DISPATCHED)",
        ctx: { fromStatus: OrderStatus.CONFIRMED, toStatus: OrderStatus.DISPATCHED, actorSide: "BUYER" },
      },
      {
        name: "CONFIRMED directly to COMPLETED is forbidden",
        ctx: { fromStatus: OrderStatus.CONFIRMED, toStatus: OrderStatus.COMPLETED, actorSide: "BUYER" },
      },
      {
        name: "DISPATCHED cannot transition backwards to CONFIRMED",
        ctx: { fromStatus: OrderStatus.DISPATCHED, toStatus: OrderStatus.CONFIRMED, actorSide: "SUPPLIER" },
      },
      {
        name: "BUYER cannot resolve DISPUTED to COMPLETED without admin",
        ctx: { fromStatus: OrderStatus.DISPUTED, toStatus: OrderStatus.COMPLETED, actorSide: "BUYER", disputeNote: "note" },
      },
      {
        name: "SUPPLIER cannot resolve DISPUTED to CANCELLED without admin",
        ctx: { fromStatus: OrderStatus.DISPUTED, toStatus: OrderStatus.CANCELLED, actorSide: "SUPPLIER", disputeNote: "note" },
      },
      {
        name: "CONFIRMED -> CANCELLED requires non-empty reason",
        ctx: { fromStatus: OrderStatus.CONFIRMED, toStatus: OrderStatus.CANCELLED, actorSide: "BUYER", reason: "" },
      },
      {
        name: "DISPUTED -> COMPLETED requires admin note",
        ctx: { fromStatus: OrderStatus.DISPUTED, toStatus: OrderStatus.COMPLETED, actorSide: "ADMIN", disputeNote: "" },
      },
    ];

    for (const tc of illegalCases) {
      it(tc.name, () => {
        expect(() => validateOrderTransition(tc.ctx)).toThrow(OrderTransitionError);
      });
    }
  });
});
