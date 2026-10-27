import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { createReportRecord } from "@/lib/repo/report";
import { limitMutation } from "@/lib/http/guard";

export async function POST(req: NextRequest) {
  try {
    const limited = await limitMutation(req, "report-create", 20);
    if (limited) return limited;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    assertCan(ctx, "report:create");

    const body = await req.json();
    const { targetType, targetId, reason, details } = body;

    if (!targetType || !targetId || !reason) {
      return NextResponse.json({ error: "Missing required report fields" }, { status: 400 });
    }

    const report = await createReportRecord({
      reporterUserId: user.id,
      targetType,
      targetId,
      reason,
      details: details || null,
    });

    return NextResponse.json(report, { status: 201 });
  } catch (err: any) {
    console.error("Report create error:", err);
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }
}
