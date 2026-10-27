import { NextRequest, NextResponse } from "next/server";
import { PlatformRole } from "@prisma/client";
import { getAuthzContext } from "@/lib/auth-user";
import { listSelectableLanguages } from "@/lib/repo/languages";
import { setUserUiLanguage } from "@/lib/repo/user";

const ONE_YEAR = 365 * 24 * 3600;

/**
 * POST /api/account/language { code } — stores the UI language in the `biznet_lang` cookie (read by
 * the root layout) and, when logged in, on the user. Only selectable languages are accepted.
 */
export async function POST(req: NextRequest) {
  const { ctx } = await getAuthzContext(req);
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "");
  const selectable = await listSelectableLanguages(ctx?.role === PlatformRole.ADMIN);
  if (!selectable.some((l) => l.code === code)) {
    return NextResponse.json({ error: "Language not available" }, { status: 400 });
  }
  if (ctx) await setUserUiLanguage(ctx.userId, code);
  const res = NextResponse.json({ code });
  res.cookies.set("biznet_lang", code, { path: "/", maxAge: ONE_YEAR, sameSite: "lax", httpOnly: false });
  return res;
}
