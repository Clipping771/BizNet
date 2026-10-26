import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { getPrivateFileSignedUrl } from "@/lib/storage";
import { PlatformRole } from "@prisma/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const session = await getSession(req);
    if (!session?.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const rawKey = Array.isArray(resolvedParams.key)
      ? resolvedParams.key.map(decodeURIComponent).join("/")
      : decodeURIComponent(resolvedParams.key);

    const isVerificationDocument =
      rawKey.includes("verification") || rawKey.startsWith("private/");

    const ctx = {
      userId: session.userId,
      role: session.role || PlatformRole.USER,
      activeBusinessId: session.activeBusinessId || null,
      businessRole: session.businessRole || null,
    };

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
