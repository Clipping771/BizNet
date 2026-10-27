import { NextResponse } from "next/server";
import { adminRouteWithParams } from "@/lib/admin/route";
import { approveTranslations } from "@/lib/repo/languages";

/** POST { keys?: string[], criticalOnly?: boolean } */
export const POST = adminRouteWithParams<{ code: string }>("Approve translations error", async (req, ctx, { code }) => {
  const body = await req.json();
  return NextResponse.json(
    await approveTranslations({ adminUserId: ctx.userId, code, keys: Array.isArray(body.keys) ? body.keys.map(String) : undefined, criticalOnly: body.criticalOnly === true })
  );
});
