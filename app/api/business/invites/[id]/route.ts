import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { MemberRole } from "@prisma/client";
import { revokeMemberInvite, findUserMembership, MembershipError } from "@/lib/repo/membership";
import { findUserById } from "@/lib/repo/user";
import { logAudit } from "@/lib/audit";
import { limitMutation } from "@/lib/http/guard";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limited = await limitMutation(req, "invite-revoke", 30);
    if (limited) return limited;
    const session = await getSession(req);
    if (!session.isLoggedIn || !session.userId || !session.activeBusinessId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await findUserById(session.userId);
    if (!user || user.deletedAt !== null) {
      session.destroy();
      return NextResponse.json({ error: "Unauthorized: account deactivated" }, { status: 401 });
    }

    const membership = await findUserMembership(session.userId, session.activeBusinessId);
    if (!membership || membership.role !== MemberRole.OWNER) {
      return NextResponse.json(
        { error: "Forbidden: only the business OWNER can revoke invitations" },
        { status: 403 }
      );
    }

    const { id } = await params;
    await revokeMemberInvite(id, session.activeBusinessId);

    await logAudit({
      actorUserId: session.userId,
      actorBusinessId: session.activeBusinessId,
      action: "member:invite_revoked",
      entityType: "MEMBER_INVITE",
      entityId: id,
    });

    return NextResponse.json({ success: true, message: "Invitation revoked" });
  } catch (err: any) {
    console.error("Revoke invite error:", err);
    if (err instanceof MembershipError || err.name === "MembershipError") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while revoking invitation" },
      { status: 500 }
    );
  }
}
