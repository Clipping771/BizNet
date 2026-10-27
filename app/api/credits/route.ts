import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { creditOverview } from "@/lib/repo/credits";

/** GET /api/credits — balance, history, packs and payment receivers for the active business. */
export async function GET(req: NextRequest) {
  try {
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });
    if (!ctx.activeBusinessId) return NextResponse.json({ error: "Active business required" }, { status: 403 });
    return NextResponse.json(await creditOverview(ctx.activeBusinessId));
  } catch (err) {
    console.error("Credits error:", err);
    return NextResponse.json({ error: "Failed to load credits" }, { status: 500 });
  }
}
