import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { listOrdersForBusiness } from "@/lib/repo/order";

/** GET /api/orders — orders where the active business is the buyer or the supplier. */
export async function GET(req: NextRequest) {
  try {
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });
    if (!ctx.activeBusinessId) return NextResponse.json({ orders: [] });
    const orders = await listOrdersForBusiness(ctx.activeBusinessId);
    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        code: o.code,
        status: o.status,
        createdAt: o.createdAt,
        total: (o.snapshot as any)?.total ?? null,
        title: o.request.title,
        requestCode: o.request.code,
        side: o.buyerBusinessId === ctx.activeBusinessId ? "BUYER" : "SUPPLIER",
        otherParty: o.buyerBusinessId === ctx.activeBusinessId ? o.supplierBusiness.name : o.buyerBusiness.name,
      })),
    });
  } catch (err) {
    console.error("List orders error:", err);
    return NextResponse.json({ error: "Failed to list orders" }, { status: 500 });
  }
}
