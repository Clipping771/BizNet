import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin/route";
import { addLanguage, listLanguagesWithProgress } from "@/lib/repo/languages";

export const GET = adminRoute("List languages error", async () => {
  return NextResponse.json({ languages: await listLanguagesWithProgress() });
});

/** POST /api/admin/languages { code, nameNative, nameEnglish, direction, fontFamily?, fallbackCode? } — starts as DRAFT. */
export const POST = adminRoute("Add language error", async (req, ctx) => {
  const body = await req.json();
  return NextResponse.json(await addLanguage({ adminUserId: ctx.userId, ...body }), { status: 201 });
});
