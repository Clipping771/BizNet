import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { getRequestForViewer } from "@/lib/repo/request";

/**
 * GET /api/requests/[id] — `id` may be the request id or its code (REQ-…).
 * Buyer members see the full request with all quotes; an eligible supplier sees
 * the request with only its own quote. Anyone else gets 404 (no existence leak).
 */
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

    const request = await getRequestForViewer(id, {
      businessId: ctx.activeBusinessId,
      isAdmin: ctx.role === "ADMIN",
    });
    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    return NextResponse.json(request);
  } catch (err: any) {
    console.error("Get request error:", err);
    return NextResponse.json({ error: "Failed to load request" }, { status: 500 });
  }
}
