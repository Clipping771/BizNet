import { NextRequest, NextResponse } from "next/server";
import { createAnswer } from "@/lib/repo/discussion";
import { discussionError, discussionWriter } from "@/lib/discussion/route-helpers";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await discussionWriter(req, { key: "answer", limit: 30, windowSeconds: 3600 });
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = await req.json();
    const result = await createAnswer({
      userId: auth.ctx.userId,
      businessId: auth.ctx.activeBusinessId,
      questionId: id,
      body: String(body.body ?? ""),
    });
    if (result.blocked) return NextResponse.json({ blocked: true, match: result.match }, { status: 422 });
    return NextResponse.json(result.answer, { status: 201 });
  } catch (err) {
    return discussionError(err, "Create answer error");
  }
}
