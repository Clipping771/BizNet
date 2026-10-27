import { NextRequest, NextResponse } from "next/server";
import { similarQuestions } from "@/lib/repo/discussion";
import { discussionError } from "@/lib/discussion/route-helpers";

/** GET /api/questions/similar?q= — top 3 similar public questions while typing (§8.14). */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    if (q.trim().length < 3) return NextResponse.json({ questions: [] });
    return NextResponse.json({ questions: await similarQuestions(q) });
  } catch (err) {
    return discussionError(err, "Similar questions error");
  }
}
