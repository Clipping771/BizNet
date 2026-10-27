import { NextRequest, NextResponse } from "next/server";
import { getQuestionDetail } from "@/lib/repo/discussion";
import { discussionError, discussionViewer } from "@/lib/discussion/route-helpers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const question = await getQuestionDetail(id, await discussionViewer(req));
    if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });
    return NextResponse.json(question);
  } catch (err) {
    return discussionError(err, "Get question error");
  }
}
