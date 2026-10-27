import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { initiateOwnershipTransfer, MembershipError } from "@/lib/repo/membership";
import { findUserById } from "@/lib/repo/user";
import { logAudit } from "@/lib/audit";
import { limitMutation } from "@/lib/http/guard";

export async function POST(req: NextRequest) {
  try {
    const limited = await limitMutation(req, "ownership-transfer", 10);
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

    const { toUserId } = await req.json();
    if (!toUserId) {
      return NextResponse.json({ error: "Recipient toUserId is required" }, { status: 400 });
    }

    const transfer = await initiateOwnershipTransfer(
      session.activeBusinessId,
      session.userId,
      toUserId
    );

    await logAudit({
      actorUserId: session.userId,
      actorBusinessId: session.activeBusinessId,
      action: "ownership:transfer_initiated",
      entityType: "OWNERSHIP_TRANSFER",
      entityId: transfer.transferId,
      after: { toUserId, expiresAt: transfer.expiresAt },
    });

    return NextResponse.json({
      success: true,
      transferId: transfer.transferId,
      expiresAt: transfer.expiresAt,
    });
  } catch (err: any) {
    console.error("Initiate ownership transfer error:", err);
    if (err instanceof MembershipError || err.name === "MembershipError") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while initiating ownership transfer" },
      { status: 500 }
    );
  }
}
