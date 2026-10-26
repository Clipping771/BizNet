import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { confirmOwnershipTransfer, MembershipError } from "@/lib/repo/membership";
import { findUserById } from "@/lib/repo/user";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await findUserById(session.userId);
    if (!user || user.deletedAt !== null) {
      session.destroy();
      return NextResponse.json({ error: "Unauthorized: account deactivated" }, { status: 401 });
    }

    const { transferId } = await req.json();
    if (!transferId) {
      return NextResponse.json({ error: "transferId is required" }, { status: 400 });
    }

    await confirmOwnershipTransfer(transferId, session.userId);

    // Update session role to OWNER
    session.businessRole = "OWNER";
    await session.save();

    await logAudit({
      actorUserId: session.userId,
      actorBusinessId: session.activeBusinessId,
      action: "ownership:transfer_confirmed",
      entityType: "OWNERSHIP_TRANSFER",
      entityId: transferId,
    });

    return NextResponse.json({
      success: true,
      message: "Ownership transfer confirmed successfully. You are now the OWNER.",
    });
  } catch (err: any) {
    console.error("Confirm ownership transfer error:", err);
    if (err instanceof MembershipError || err.name === "MembershipError") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while confirming ownership transfer" },
      { status: 500 }
    );
  }
}
