import { NextRequest, NextResponse } from "next/server";
import { markBestAnswer } from "@/lib/repo/discussion";
import { discussionError, discussionWriter } from "@/lib/discussion/route-helpers";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await discussionWriter(req, { key: "best-answer", limit: 60, windowSeconds: 3600 });
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = await req.json();
    const updated = await markBestAnswer({ userId: auth.ctx.userId, questionId: id, answerId: String(body.answerId ?? "") });
    return NextResponse.json(updated);
  } catch (err) {
    return discussionError(err, "Best answer error");
  }
}
