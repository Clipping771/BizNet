import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { getPrivateFileSignedUrl } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { ctx: dbCtx, error: authError, status: authStatus } = await getAuthzContext(req);
    if (authError || !dbCtx) {
      return NextResponse.json({ error: authError || "Unauthorized" }, { status: authError ? authStatus : 401 });
    }

    const resolvedParams = await params;
    const rawKey = Array.isArray(resolvedParams.key)
      ? resolvedParams.key.map(decodeURIComponent).join("/")
      : decodeURIComponent(resolvedParams.key);

    const isVerificationDocument =
      rawKey.includes("verification") || rawKey.startsWith("private/");

    const ctx = dbCtx;

    assertCan(ctx, "file:read_private", {
      isVerificationDocument,
    });

    const signedUrl = await getPrivateFileSignedUrl(rawKey, 300);

    return NextResponse.json({
      url: signedUrl,
      expiresIn: 300,
    });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message || "Failed to generate signed URL" }, { status: 500 });
  }
}
