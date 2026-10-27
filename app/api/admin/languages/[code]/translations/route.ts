import { NextResponse } from "next/server";
import { adminRouteWithParams } from "@/lib/admin/route";
import { listTranslations, saveTranslation } from "@/lib/repo/languages";

export const GET = adminRouteWithParams<{ code: string }>("List translations error", async (req, _ctx, { code }) => {
  const filter = req.nextUrl.searchParams.get("filter");
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);
  return NextResponse.json({
    translations: await listTranslations(code, filter === "unapproved" || filter === "critical" ? filter : "all", offset),
  });
});

/** PUT { key, text, approve } — placeholders must match the English source. */
export const PUT = adminRouteWithParams<{ code: string }>("Save translation error", async (req, ctx, { code }) => {
  const body = await req.json();
  return NextResponse.json(
    await saveTranslation({ adminUserId: ctx.userId, code, key: String(body.key ?? ""), text: String(body.text ?? ""), approve: body.approve !== false })
  );
});
