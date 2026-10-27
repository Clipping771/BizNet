import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { findOrderById, updateOrderStatusRecord } from "@/lib/repo/order";
import { OrderStatus, DisputeResolution } from "@prisma/client";
import { limitMutation } from "@/lib/http/guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limited = await limitMutation(req, "order-status", 60);
    if (limited) return limited;
    const { id } = await params;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    const order = await findOrderById(id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const isAdmin = ctx.role === "ADMIN";
    const isBuyer = ctx.activeBusinessId === order.buyerBusinessId;
    const isSupplier = ctx.activeBusinessId === order.supplierBusinessId;

    if (!isAdmin && !isBuyer && !isSupplier) {
      return NextResponse.json({ error: "IDOR: Cannot update status for an order belonging to another business" }, { status: 403 });
    }

    assertCan(ctx, "order:update_status", {
      buyerBusinessId: order.buyerBusinessId,
      supplierBusinessId: order.supplierBusinessId,
    });

    const body = await req.json();
    const { toStatus, reason, disputeResolution, disputeNote } = body;

    if (!toStatus || !Object.values(OrderStatus).includes(toStatus)) {
      return NextResponse.json({ error: "Invalid target status" }, { status: 400 });
    }

    // A member acts as their side of the deal; the ADMIN side is only for admins outside it
    const actorSide: "BUYER" | "SUPPLIER" | "ADMIN" = isBuyer ? "BUYER" : isSupplier ? "SUPPLIER" : "ADMIN";

    const updated = await updateOrderStatusRecord({
      orderId: id,
      toStatus: toStatus as OrderStatus,
      actorUserId: user.id,
      actorSide,
      reason,
      disputeResolution: disputeResolution as DisputeResolution,
      disputeNote,
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error("Update order status error:", err);
    return NextResponse.json({ error: err.message || "Failed to update order status" }, { status: 400 });
  }
}
