import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { findOrderByCode, findOrderById } from "@/lib/repo/order";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    // Attempt lookup by code or id
    let order = await findOrderByCode(id);
    if (!order) {
      order = await findOrderById(id);
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // IDOR verification: User's active business must be buyer business, supplier business, or ADMIN
    const isBuyer = ctx.activeBusinessId === order.buyerBusinessId;
    const isSupplier = ctx.activeBusinessId === order.supplierBusinessId;
    const isAdmin = ctx.role === "ADMIN";

    if (!isBuyer && !isSupplier && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      order,
      userRoleOnOrder: isBuyer ? "BUYER" : isSupplier ? "SUPPLIER" : "ADMIN",
    });
  } catch (error: any) {
    console.error("GET /api/orders/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
