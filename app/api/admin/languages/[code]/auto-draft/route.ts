import { NextResponse } from "next/server";
import { adminRouteWithParams } from "@/lib/admin/route";
import { autoDraftLanguage } from "@/lib/repo/languages";

/** POST — machine-draft missing keys through the TranslationProvider (unapproved). */
export const POST = adminRouteWithParams<{ code: string }>("Auto-draft error", async (_req, ctx, { code }) => {
  return NextResponse.json(await autoDraftLanguage({ adminUserId: ctx.userId, code }));
});
