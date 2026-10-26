import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { normalizeBdPhone } from "@/lib/phone";
import { InviteRole, MemberRole } from "@prisma/client";
import {
  createMemberInvite,
  listPendingInvites,
  findUserMembership,
  MembershipError,
} from "@/lib/repo/membership";
import { findUserById } from "@/lib/repo/user";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
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
    if (!membership || (membership.role !== MemberRole.OWNER && membership.role !== MemberRole.MANAGER)) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
    }

    const invites = await listPendingInvites(session.activeBusinessId);
    return NextResponse.json({ success: true, invites });
  } catch (err: any) {
    console.error("List invites error:", err);
    if (err instanceof MembershipError || err.name === "MembershipError") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to list invites" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session.isLoggedIn || !session.userId || !session.activeBusinessId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await findUserById(session.userId);
    if (!user || user.deletedAt !== null) {
      session.destroy();
      return NextResponse.json({ error: "Unauthorized: account deactivated" }, { status: 401 });
    }

    // Only OWNER can invite members
    const membership = await findUserMembership(session.userId, session.activeBusinessId);
    if (!membership || membership.role !== MemberRole.OWNER) {
      return NextResponse.json(
        { error: "Forbidden: only the business OWNER can invite members" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const phone = body.phone ? normalizeBdPhone(body.phone) : null;
    const email = body.email && typeof body.email === "string" && body.email.includes("@")
      ? body.email.toLowerCase().trim()
      : null;

    if (!phone && !email) {
      return NextResponse.json(
        { error: "Valid phone number or email address is required" },
        { status: 400 }
      );
    }

    const role = body.role as InviteRole;
    if (role !== InviteRole.MANAGER && role !== InviteRole.STAFF) {
      return NextResponse.json(
        { error: "Invalid role: only MANAGER or STAFF can be invited" },
        { status: 400 }
      );
    }

    const invite = await createMemberInvite(
      session.activeBusinessId,
      session.userId,
      { phone: phone || undefined, email: email || undefined },
      role
    );

    await logAudit({
      actorUserId: session.userId,
      actorBusinessId: session.activeBusinessId,
      action: "member:invite_created",
      entityType: "MEMBER_INVITE",
      entityId: invite.inviteId,
      after: { phone, email, role, expiresAt: invite.expiresAt },
    });

    return NextResponse.json({
      success: true,
      inviteId: invite.inviteId,
      token: invite.rawToken,
      expiresAt: invite.expiresAt,
    });
  } catch (err: any) {
    console.error("Create invite error:", err);
    if (err instanceof MembershipError || err.name === "MembershipError") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while creating invitation" },
      { status: 500 }
    );
  }
}
