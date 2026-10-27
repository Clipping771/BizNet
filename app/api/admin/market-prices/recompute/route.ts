import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { runComputeMarketPricesJob } from "@/jobs/compute-market-prices";

/** POST /api/admin/market-prices/recompute — run the nightly job now (audited). */
export async function POST(req: NextRequest) {
  try {
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });
    assertCan(ctx, "admin:access");
    const result = await runComputeMarketPricesJob();
    await logAudit({ actorUserId: ctx.userId, action: "MARKET_PRICES_RECOMPUTED", entityType: "MARKET_PRICES", entityId: "all", after: { ...result } });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthorizationError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Recompute prices error:", err);
    return NextResponse.json({ error: "Failed to recompute prices" }, { status: 500 });
  }
}
