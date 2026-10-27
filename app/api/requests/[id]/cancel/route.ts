import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { cancelRequestRecord, findRequestById } from "@/lib/repo/request";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    if (!ctx.activeBusinessId) {
      return NextResponse.json({ error: "Active business required" }, { status: 403 });
    }

    const request = await findRequestById(id);
    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (request.buyerBusinessId !== ctx.activeBusinessId && ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "IDOR: Cannot cancel another business's request" }, { status: 403 });
    }

    assertCan(ctx, "request:cancel", { buyerBusinessId: request.buyerBusinessId });

    const body = await req.json();
    const { reason } = body;

    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: "Cancellation reason is required" }, { status: 400 });
    }

    const cancelled = await cancelRequestRecord(
      id,
      request.buyerBusinessId,
      user.id,
      reason.trim()
    );

    return NextResponse.json(cancelled);
  } catch (err: any) {
    console.error("Cancel request error:", err);
    return NextResponse.json({ error: err.message || "Failed to cancel request" }, { status: 400 });
  }
}
