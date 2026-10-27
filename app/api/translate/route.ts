import { NextRequest, NextResponse } from "next/server";
import { PlatformRole } from "@prisma/client";
import { getAuthzContext } from "@/lib/auth-user";
import { TranslationError, translateContent } from "@/lib/repo/content-translation";
import { limitMutation } from "@/lib/http/guard";

/** POST /api/translate { entityType, entityId, field, targetLang } — on-demand content translation (F22). */
export async function POST(req: NextRequest) {
  try {
    const limited = await limitMutation(req, "translate", 300);
    if (limited) return limited;
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });
    const body = await req.json();
    const result = await translateContent({
      viewer: { userId: ctx.userId, businessId: ctx.activeBusinessId, isAdmin: ctx.role === PlatformRole.ADMIN },
      entityType: String(body.entityType ?? ""),
      entityId: String(body.entityId ?? ""),
      field: String(body.field ?? ""),
      targetLang: String(body.targetLang ?? ""),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TranslationError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Translate error:", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
