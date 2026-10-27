import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { findOrderById, submitReliabilityFeedbackRecord } from "@/lib/repo/order";
import { limitMutation } from "@/lib/http/guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limited = await limitMutation(req, "order-feedback", 30);
    if (limited) return limited;
    const { id } = await params;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    if (!ctx.activeBusinessId) {
      return NextResponse.json({ error: "Active business required" }, { status: 403 });
    }

    const order = await findOrderById(id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.buyerBusinessId !== ctx.activeBusinessId && ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "IDOR: Only the buyer can submit feedback for this order" }, { status: 403 });
    }

    assertCan(ctx, "feedback:give", { buyerBusinessId: order.buyerBusinessId });

    const body = await req.json();
    const { onTime, quantityCorrect, matchedSpec, hadIssue, issueResolved, note } = body;

    const feedback = await submitReliabilityFeedbackRecord({
      orderId: id,
      userId: user.id,
      buyerBusinessId: order.buyerBusinessId,
      onTime,
      quantityCorrect,
      matchedSpec,
      hadIssue: !!hadIssue,
      issueResolved,
      note,
    });

    return NextResponse.json(feedback, { status: 201 });
  } catch (err: any) {
    console.error("Submit feedback error:", err);
    return NextResponse.json({ error: err.message || "Failed to submit feedback" }, { status: 400 });
  }
}
