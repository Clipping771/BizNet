import { NextResponse } from "next/server";
import { adminRouteWithParams } from "@/lib/admin/route";
import { setLanguageStatus } from "@/lib/repo/languages";

/** PATCH /api/admin/languages/[code] { status } — ACTIVE only with ≥ 90% critical keys approved. */
export const PATCH = adminRouteWithParams<{ code: string }>("Language status error", async (req, ctx, { code }) => {
  const body = await req.json();
  return NextResponse.json(await setLanguageStatus({ adminUserId: ctx.userId, code, status: body.status }));
});
