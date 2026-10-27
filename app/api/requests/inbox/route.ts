import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { listInboxRequestsForSupplier } from "@/lib/repo/request";

export async function GET(req: NextRequest) {
  try {
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    if (!ctx.activeBusinessId) {
      return NextResponse.json({ error: "Active supplier business required" }, { status: 403 });
    }

    const requests = await listInboxRequestsForSupplier(ctx.activeBusinessId);
    return NextResponse.json(requests);
  } catch (err: any) {
    console.error("Supplier inbox error:", err);
    return NextResponse.json({ error: "Failed to list inbox requests" }, { status: 500 });
  }
}
