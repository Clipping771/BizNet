import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { latestSnapshots } from "@/lib/repo/pricing";

/** GET /api/admin/market-prices — every group of the latest run, publishable or not, with exclusion counts. */
export async function GET(req: NextRequest) {
  try {
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });
    assertCan(ctx, "admin:access");
    return NextResponse.json({ groups: await latestSnapshots({ all: true }) });
  } catch (err) {
    if (err instanceof AuthorizationError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Admin prices error:", err);
    return NextResponse.json({ error: "Failed to load prices" }, { status: 500 });
  }
}
