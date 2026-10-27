import { NextResponse } from "next/server";
import { adminRouteWithParams } from "@/lib/admin/route";
import { resolveReport } from "@/lib/repo/admin";

/** POST /api/admin/reports/[id] { status: REVIEWED|ACTION_TAKEN|DISMISSED, note? } — audited. */
export const POST = adminRouteWithParams<{ id: string }>("Resolve report error", async (req, ctx, { id }) => {
  const body = await req.json();
  return NextResponse.json(await resolveReport({ adminUserId: ctx.userId, reportId: id, status: body.status, note: body.note ?? null }));
});
