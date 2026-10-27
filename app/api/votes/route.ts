import { NextRequest, NextResponse } from "next/server";
import { VoteTarget } from "@prisma/client";
import { castVote } from "@/lib/repo/discussion";
import { discussionError, discussionWriter } from "@/lib/discussion/route-helpers";

export async function POST(req: NextRequest) {
  try {
    const auth = await discussionWriter(req, { key: "vote", limit: 120, windowSeconds: 3600 });
    if (!auth.ok) return auth.response;
    const body = await req.json();
    if (!Object.values(VoteTarget).includes(body.targetType) || (body.value !== 1 && body.value !== -1) || !body.targetId) {
      return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
    }
    const result = await castVote({
      userId: auth.ctx.userId,
      targetType: body.targetType,
      targetId: String(body.targetId),
      value: body.value,
    });
    return NextResponse.json(result);
  } catch (err) {
    return discussionError(err, "Vote error");
  }
}
