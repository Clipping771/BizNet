import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { acceptMemberInvite, MembershipError } from "@/lib/repo/membership";
import { findUserById } from "@/lib/repo/user";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: "Unauthorized: please log in first" }, { status: 401 });
    }

    const user = await findUserById(session.userId);
    if (!user || user.deletedAt !== null) {
      session.destroy();
      return NextResponse.json({ error: "Unauthorized: account deactivated" }, { status: 401 });
    }

    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: "Invitation token required" }, { status: 400 });
    }

    const membership = await acceptMemberInvite(token, session.userId);

    // Switch session to newly joined business
    session.activeBusinessId = membership.businessId;
    session.businessRole = membership.role;
    await session.save();

    await logAudit({
      actorUserId: session.userId,
      actorBusinessId: membership.businessId,
      action: "member:invite_accepted",
      entityType: "MEMBERSHIP",
      entityId: membership.id,
      after: { role: membership.role },
    });

    return NextResponse.json({
      success: true,
      businessId: membership.businessId,
      role: membership.role,
    });
  } catch (err: any) {
    console.error("Accept invite error:", err);
    if (err instanceof MembershipError || err.name === "MembershipError") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while accepting invitation" },
      { status: 500 }
    );
  }
}
