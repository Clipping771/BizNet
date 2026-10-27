import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { createPriceExclusion } from "@/lib/repo/pricing";

/** POST /api/admin/market-prices/exclusions { quoteId, reason } — the job skips excluded quotes (audited). */
export async function POST(req: NextRequest) {
  try {
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });
    assertCan(ctx, "admin:access");
    const body = await req.json();
    const reason = String(body.reason ?? "").trim();
    if (!body.quoteId || !reason) return NextResponse.json({ error: "quoteId and reason are required" }, { status: 400 });
    const exclusion = await createPriceExclusion({ adminUserId: ctx.userId, quoteId: String(body.quoteId), reason: reason.slice(0, 500) });
    return NextResponse.json(exclusion, { status: 201 });
  } catch (err: any) {
    if (err instanceof AuthorizationError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err?.message === "Quote not found") return NextResponse.json({ error: err.message }, { status: 404 });
    console.error("Price exclusion error:", err);
    return NextResponse.json({ error: "Failed to exclude quote" }, { status: 500 });
  }
}
