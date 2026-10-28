import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { homeSummary } from "@/lib/repo/home";

/** GET /api/home — counts and recent requests for the home screen. */
export async function GET(req: NextRequest) {
  try {
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });
    return NextResponse.json(await homeSummary(ctx.userId, ctx.activeBusinessId));
  } catch (err) {
    console.error("Home summary error:", err);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
