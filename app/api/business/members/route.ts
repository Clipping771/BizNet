import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listBusinessMembers, findUserMembership } from "@/lib/repo/membership";
import { findUserById } from "@/lib/repo/user";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId || !session.activeBusinessId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await findUserById(session.userId);
    if (!user || user.deletedAt !== null) {
      session.destroy();
      return NextResponse.json({ error: "Unauthorized: account deactivated" }, { status: 401 });
    }

    const membership = await findUserMembership(session.userId, session.activeBusinessId);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden: not a business member" }, { status: 403 });
    }

    const members = await listBusinessMembers(session.activeBusinessId);

    return NextResponse.json({
      success: true,
      members,
      currentUserRole: membership.role,
    });
  } catch (err: any) {
    console.error("List business members error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
