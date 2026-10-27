import { NextResponse } from "next/server";
import { adminRouteWithParams, AdminError } from "@/lib/admin/route";
import { importLanguage } from "@/lib/repo/languages";

/** POST { key: text, … } — imported as unapproved drafts; placeholder mismatches are skipped. */
export const POST = adminRouteWithParams<{ code: string }>("Import language error", async (req, ctx, { code }) => {
  const data = await req.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new AdminError("Expected a JSON object of key → text");
  return NextResponse.json(await importLanguage({ adminUserId: ctx.userId, code, data }));
});
