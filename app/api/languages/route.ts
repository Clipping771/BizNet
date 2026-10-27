import { NextRequest, NextResponse } from "next/server";
import { PlatformRole } from "@prisma/client";
import { getAuthzContext } from "@/lib/auth-user";
import { listSelectableLanguages } from "@/lib/repo/languages";

/** GET /api/languages — ACTIVE languages for everyone; admins also see DRAFT/BETA as previews (§11). */
export async function GET(req: NextRequest) {
  const { ctx } = await getAuthzContext(req);
  const languages = await listSelectableLanguages(ctx?.role === PlatformRole.ADMIN);
  return NextResponse.json({ languages });
}
