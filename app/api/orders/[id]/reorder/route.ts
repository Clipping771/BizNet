import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { findOrderById } from "@/lib/repo/order";
import { createReorderFromOrder } from "@/lib/repo/request";
import { limitMutation } from "@/lib/http/guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limited = await limitMutation(req, "order-reorder", 20);
    if (limited) return limited;
    const { id } = await params;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    if (!ctx.activeBusinessId) {
      return NextResponse.json({ error: "Active business required" }, { status: 403 });
    }

    const order = await findOrderById(id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.buyerBusinessId !== ctx.activeBusinessId && ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "IDOR: Only the buyer can re-order from this order" }, { status: 403 });
    }

    assertCan(ctx, "request:create", { buyerBusinessId: order.buyerBusinessId });

    const body = await req.json();
    const { mode } = body; // "PREVIOUS_SUPPLIER_ONLY" | "EVERYONE"

    if (mode !== "PREVIOUS_SUPPLIER_ONLY" && mode !== "EVERYONE") {
      return NextResponse.json(
        { error: "Invalid re-order mode: must be 'PREVIOUS_SUPPLIER_ONLY' or 'EVERYONE'" },
        { status: 400 }
      );
    }

    const newRequest = await createReorderFromOrder({
      orderId: id,
      buyerBusinessId: order.buyerBusinessId,
      userId: user.id,
      mode,
    });

    return NextResponse.json(newRequest, { status: 201 });
  } catch (err: any) {
    console.error("Re-order error:", err);
    return NextResponse.json({ error: err.message || "Failed to initiate re-order" }, { status: 400 });
  }
}
