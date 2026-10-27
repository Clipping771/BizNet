import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { listHeldQuestions } from "@/lib/repo/discussion";

/** GET /api/admin/questions/held — questions held by the selling filter, oldest first. */
export async function GET(req: NextRequest) {
  try {
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });
    assertCan(ctx, "admin:access");
    return NextResponse.json({ questions: await listHeldQuestions() });
  } catch (err) {
    if (err instanceof AuthorizationError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Held questions error:", err);
    return NextResponse.json({ error: "Failed to list held questions" }, { status: 500 });
  }
}
