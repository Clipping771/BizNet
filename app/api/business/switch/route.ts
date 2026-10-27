import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findUserMembership, MembershipError } from "@/lib/repo/membership";
import { updateUserActiveBusiness, findUserById } from "@/lib/repo/user";
import { limitMutation } from "@/lib/http/guard";

export async function POST(req: NextRequest) {
  try {
    const limited = await limitMutation(req, "business-switch", 120);
    if (limited) return limited;
    const session = await getSession(req);
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await findUserById(session.userId);
    if (!user || user.deletedAt !== null) {
      session.destroy();
      return NextResponse.json({ error: "Unauthorized: account deactivated" }, { status: 401 });
    }

    const { businessId } = await req.json();
    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    const membership = await findUserMembership(session.userId, businessId);
    if (!membership) {
      return NextResponse.json(
        { error: "Forbidden: you are not a member of this business" },
        { status: 403 }
      );
    }

    await updateUserActiveBusiness(session.userId, businessId);

    session.activeBusinessId = businessId;
    session.businessRole = membership.role;
    await session.save();

    return NextResponse.json({
      success: true,
      activeBusinessId: businessId,
      businessRole: membership.role,
    });
  } catch (err: any) {
    console.error("Switch business error:", err);
    if (err instanceof MembershipError || err.name === "MembershipError") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while switching business" },
      { status: 500 }
    );
  }
}
