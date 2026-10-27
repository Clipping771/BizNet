import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { listConciergeZeroMatchQueue } from "@/lib/repo/report";

export async function GET(req: NextRequest) {
  try {
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    assertCan(ctx, "admin:access");

    const queueItems = await listConciergeZeroMatchQueue();

    return NextResponse.json(queueItems);
  } catch (err: any) {
    console.error("Concierge queue error:", err);
    return NextResponse.json({ error: "Failed to fetch concierge queue" }, { status: 500 });
  }
}
