import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { listQuotesForSupplier } from "@/lib/repo/quote";

/** GET /api/quotes — the active (supplier) business's own quotes. */
export async function GET(req: NextRequest) {
  try {
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });
    if (!ctx.activeBusinessId) return NextResponse.json({ quotes: [] });
    return NextResponse.json({ quotes: await listQuotesForSupplier(ctx.activeBusinessId) });
  } catch (err) {
    console.error("List quotes error:", err);
    return NextResponse.json({ error: "Failed to list quotes" }, { status: 500 });
  }
}
