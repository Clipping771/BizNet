import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { DiscussionError, reviewHeldQuestion } from "@/lib/repo/discussion";

/** POST /api/admin/questions/[id]/review { approve: boolean, note? } — audited. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });
    assertCan(ctx, "admin:access");
    const { id } = await params;
    const body = await req.json();
    if (typeof body.approve !== "boolean") return NextResponse.json({ error: "approve must be true or false" }, { status: 400 });
    const updated = await reviewHeldQuestion({ adminUserId: ctx.userId, questionId: id, approve: body.approve, note: body.note ?? null });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof AuthorizationError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof DiscussionError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Review question error:", err);
    return NextResponse.json({ error: "Failed to review question" }, { status: 500 });
  }
}
