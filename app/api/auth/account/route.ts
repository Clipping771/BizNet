import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { anonymizeUser, findUserById } from "@/lib/repo/user";
import { countUserOwnedBusinesses } from "@/lib/repo/membership";
import { logAudit } from "@/lib/audit";

export async function DELETE() {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;

    // Verify user exists and is not already deleted
    const user = await findUserById(userId);
    if (!user || user.deletedAt !== null) {
      session.destroy();
      return NextResponse.json(
        { error: "Account not found or already deleted" },
        { status: 404 }
      );
    }

    // Invariant: Business cannot be left without an OWNER.
    // An OWNER must transfer ownership before their account can be deleted.
    const ownedCount = await countUserOwnedBusinesses(userId);
    if (ownedCount > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete account while you are the OWNER of one or more businesses. Please transfer business ownership first.",
        },
        { status: 400 }
      );
    }

    const phone = session.phone;

    // Execute anonymization
    await anonymizeUser(userId);

    // Audit log
    await logAudit({
      actorUserId: userId,
      action: "user:anonymize",
      entityType: "USER",
      entityId: userId,
      before: { phone },
      after: { deleted: true },
    });

    // Destroy session cookie
    session.destroy();

    return NextResponse.json({
      success: true,
      message: "Account anonymized and deleted successfully",
    });
  } catch (err: any) {
    console.error("Account deletion error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while deleting account" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await findUserById(session.userId);
    if (!user || user.deletedAt !== null) {
      session.destroy();
      return NextResponse.json({ error: "Account not found or deleted" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role,
        activeBusinessId: user.activeBusinessId || session.activeBusinessId,
      },
    });
  } catch (err: any) {
    console.error("Get account error:", err);
    return NextResponse.json({ error: "Failed to get account" }, { status: 500 });
  }
}
