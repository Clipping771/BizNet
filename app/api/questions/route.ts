import { NextRequest, NextResponse } from "next/server";
import { createQuestion, listQuestions } from "@/lib/repo/discussion";
import { discussionError, discussionViewer, discussionWriter } from "@/lib/discussion/route-helpers";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const viewer = await discussionViewer(req);
    const questions = await listQuestions({
      categoryId: params.get("categoryId"),
      q: params.get("q"),
      viewer,
      offset: Math.min(Math.max(0, Number(params.get("offset")) || 0), 1000),
    });
    return NextResponse.json({ questions });
  } catch (err) {
    return discussionError(err, "List questions error");
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await discussionWriter(req, { key: "question", limit: 10, windowSeconds: 86400 });
    if (!auth.ok) return auth.response;
    const { ctx } = auth;

    const body = await req.json();
    const result = await createQuestion({
      userId: ctx.userId,
      businessId: ctx.activeBusinessId,
      title: String(body.title ?? ""),
      body: String(body.body ?? ""),
      categoryId: body.categoryId || null,
      isAnonymous: !!body.isAnonymous,
      submitAnyway: !!body.submitAnyway,
    });

    if (result.blocked) {
      // Soft block: nothing saved; the author may edit or submit anyway (→ held for review)
      return NextResponse.json({ blocked: true, match: result.match }, { status: 422 });
    }
    return NextResponse.json(result.question, { status: 201 });
  } catch (err) {
    return discussionError(err, "Create question error");
  }
}
