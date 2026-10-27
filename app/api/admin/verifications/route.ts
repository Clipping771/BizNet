import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { getPendingVerifications } from "@/lib/repo/verification";

export async function GET(req: NextRequest) {
  try {
    const { ctx: dbCtx, error: authError, status: authStatus } = await getAuthzContext(req);
    if (authError || !dbCtx) {
      return NextResponse.json({ error: authError || "Unauthorized" }, { status: authError ? authStatus : 401 });
    }

    const ctx = dbCtx;

    assertCan(ctx, "admin:access");

    const pending = await getPendingVerifications();
    return NextResponse.json({ verifications: pending });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message || "Failed to load verifications" }, { status: 500 });
  }
}
