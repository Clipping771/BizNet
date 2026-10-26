import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { reviewVerificationRequest, VerificationError } from "@/lib/repo/verification";
import { PlatformRole, VerificationStatus } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const resolvedParams = await params;
    const requestId = resolvedParams.id;

    const body = await req.json();
    const { targetStatus, minutesSpent, reviewNote, checklist } = body;

    if (!targetStatus || !Object.values(VerificationStatus).includes(targetStatus)) {
      return NextResponse.json({ error: "Invalid target verification status" }, { status: 400 });
    }

    const minutesNum = Number(minutesSpent);
    if (!minutesNum || minutesNum <= 0) {
      return NextResponse.json({ error: "Minutes spent is required and must be greater than 0" }, { status: 400 });
    }

    const updated = await reviewVerificationRequest({
      adminUserId: session.userId,
      requestId,
      targetStatus,
      minutesSpent: minutesNum,
      reviewNote,
      checklist,
    });

    return NextResponse.json({ success: true, verification: updated });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof VerificationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || "Failed to review verification" }, { status: 500 });
  }
}
