import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { getPendingVerifications } from "@/lib/repo/verification";
import { PlatformRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ctx = {
      userId: session.userId,
      role: session.role || PlatformRole.USER,
    };

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
