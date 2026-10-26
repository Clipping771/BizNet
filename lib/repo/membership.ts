import * as crypto from "crypto";
import { prisma } from "../prisma";
import { InviteRole, MemberRole, Membership } from "@prisma/client";

export class MembershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MembershipError";
  }
}

export async function listBusinessMembers(businessId: string): Promise<Membership[]> {
  return prisma.membership.findMany({
    where: { businessId },
    include: { user: true },
  });
}

export async function countUserOwnedBusinesses(userId: string): Promise<number> {
  return prisma.membership.count({
    where: {
      userId,
      role: MemberRole.OWNER,
    },
  });
}

export async function getUserMembership(
  userId: string,
  businessId: string
): Promise<Membership | null> {
  return prisma.membership.findUnique({
    where: {
      userId_businessId: { userId, businessId },
    },
  });
}

/**
 * Creates an invitation for MANAGER or STAFF only. Inviting as OWNER is disallowed.
 */
export async function createMemberInvite(
  businessId: string,
  invitedByUserId: string,
  target: { phone?: string; email?: string } | string,
  role: InviteRole
): Promise<{ inviteId: string; rawToken: string; expiresAt: Date }> {
  const rawToken = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  let phone: string | null = null;
  let email: string | null = null;

  if (typeof target === "string") {
    if (target.includes("@")) {
      email = target.toLowerCase().trim();
    } else {
      phone = target.trim();
    }
  } else {
    phone = target.phone ? target.phone.trim() : null;
    email = target.email ? target.email.toLowerCase().trim() : null;
  }

  if (!phone && !email) {
    throw new MembershipError("Either phone number or email is required for invitation");
  }

  const invite = await prisma.memberInvite.create({
    data: {
      businessId,
      invitedByUserId,
      phone,
      email,
      role,
      tokenHash,
      expiresAt,
    },
  });

  return {
    inviteId: invite.id,
    rawToken,
    expiresAt,
  };
}

export async function listPendingInvites(businessId: string) {
  return prisma.memberInvite.findMany({
    where: {
      businessId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeMemberInvite(inviteId: string, businessId: string) {
  const invite = await prisma.memberInvite.findFirst({
    where: { id: inviteId, businessId },
  });
  if (!invite) {
    throw new MembershipError("Invitation not found");
  }
  return prisma.memberInvite.update({
    where: { id: inviteId },
    data: { revokedAt: new Date() },
  });
}

/**
 * Accepts a member invitation.
 */
export async function acceptMemberInvite(rawToken: string, userId: string): Promise<Membership> {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const now = new Date();

  const invite = await prisma.memberInvite.findUnique({
    where: { tokenHash },
  });

  if (!invite) {
    throw new MembershipError("Invalid invitation token");
  }

  if (invite.expiresAt < now) {
    throw new MembershipError("Invitation expired");
  }

  if (invite.acceptedAt) {
    throw new MembershipError("Invitation already accepted");
  }

  if (invite.revokedAt) {
    throw new MembershipError("Invitation has been revoked");
  }

  // 1. Verify user's phone matches the phone the invite was sent to
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new MembershipError("User not found");
  }

  if (invite.phone && user.phone !== invite.phone) {
    throw new MembershipError("Invitation phone number does not match your account phone number");
  }

  if (invite.email && user.email?.toLowerCase().trim() !== invite.email.toLowerCase().trim()) {
    throw new MembershipError("Invitation email does not match your account email");
  }

  return prisma.$transaction(async (tx) => {
    // 2. Prevent existing OWNER from demoting themselves by accepting an invite
    const existingMembership = await tx.membership.findUnique({
      where: {
        userId_businessId: {
          userId,
          businessId: invite.businessId,
        },
      },
    });

    if (existingMembership?.role === MemberRole.OWNER) {
      throw new MembershipError(
        "Current OWNER cannot accept a staff/manager invitation for their own business"
      );
    }

    await tx.memberInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: now },
    });

    const role = invite.role === InviteRole.MANAGER ? MemberRole.MANAGER : MemberRole.STAFF;

    return tx.membership.upsert({
      where: {
        userId_businessId: {
          userId,
          businessId: invite.businessId,
        },
      },
      update: { role },
      create: {
        userId,
        businessId: invite.businessId,
        role,
      },
    });
  });
}

/**
 * Initiates an ownership transfer. Can only be initiated by current OWNER to an existing member.
 */
export async function initiateOwnershipTransfer(
  businessId: string,
  fromUserId: string,
  toUserId: string
): Promise<{ transferId: string; expiresAt: Date }> {
  // Validate that fromUser is currently OWNER
  const fromMembership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: fromUserId, businessId } },
  });
  if (!fromMembership || fromMembership.role !== MemberRole.OWNER) {
    throw new MembershipError("Only current OWNER can initiate transfer");
  }

  // Validate that toUser is already a member
  const toMembership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: toUserId, businessId } },
  });
  if (!toMembership) {
    throw new MembershipError("Recipient must be an existing member of the business");
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  const transfer = await prisma.ownershipTransfer.create({
    data: {
      businessId,
      fromUserId,
      toUserId,
      expiresAt,
    },
  });

  return {
    transferId: transfer.id,
    expiresAt,
  };
}

/**
 * Confirms an ownership transfer. Roles swap in ONE atomic transaction:
 * Old owner becomes MANAGER, recipient becomes OWNER.
 * Invariant: exactly one OWNER remains.
 */
export async function confirmOwnershipTransfer(
  transferId: string,
  toUserId: string
): Promise<void> {
  const transfer = await prisma.ownershipTransfer.findUnique({
    where: { id: transferId },
  });

  if (!transfer) {
    throw new MembershipError("Transfer request not found");
  }
  if (transfer.toUserId !== toUserId) {
    throw new MembershipError("Unauthorized: only the designated recipient can confirm");
  }
  if (transfer.confirmedAt) {
    throw new MembershipError("Transfer already confirmed");
  }
  if (transfer.cancelledAt) {
    throw new MembershipError("Transfer was cancelled");
  }
  if (transfer.expiresAt < new Date()) {
    throw new MembershipError("Transfer request expired");
  }

  await prisma.$transaction(async (tx) => {
    // 0. Verify that initiator is still current OWNER
    const fromMembership = await tx.membership.findUnique({
      where: {
        userId_businessId: {
          userId: transfer.fromUserId,
          businessId: transfer.businessId,
        },
      },
    });

    if (!fromMembership || fromMembership.role !== MemberRole.OWNER) {
      throw new MembershipError("Transfer initiator is no longer the OWNER of this business");
    }

    const toMembership = await tx.membership.findUnique({
      where: {
        userId_businessId: {
          userId: transfer.toUserId,
          businessId: transfer.businessId,
        },
      },
    });

    if (!toMembership) {
      throw new MembershipError("Recipient is no longer a member of this business");
    }

    // 1. Mark transfer confirmed
    await tx.ownershipTransfer.update({
      where: { id: transferId },
      data: { confirmedAt: new Date() },
    });

    // 2. Old owner becomes MANAGER
    await tx.membership.update({
      where: {
        userId_businessId: {
          userId: transfer.fromUserId,
          businessId: transfer.businessId,
        },
      },
      data: { role: MemberRole.MANAGER },
    });

    // 3. New owner becomes OWNER
    await tx.membership.update({
      where: {
        userId_businessId: {
          userId: transfer.toUserId,
          businessId: transfer.businessId,
        },
      },
      data: { role: MemberRole.OWNER },
    });

    // 4. Assert invariant: exactly one OWNER in business
    const owners = await tx.membership.count({
      where: {
        businessId: transfer.businessId,
        role: MemberRole.OWNER,
      },
    });

    if (owners !== 1) {
      throw new MembershipError("Single-owner invariant violated");
    }
  });
}

/**
 * Removes a member. The last OWNER cannot leave or be removed.
 */
export async function removeMember(
  businessId: string,
  requesterUserId: string,
  targetUserId: string
): Promise<void> {
  const target = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: targetUserId, businessId } },
  });

  if (!target) {
    throw new MembershipError("Member not found");
  }

  if (target.role === MemberRole.OWNER) {
    throw new MembershipError("The business OWNER cannot be removed. Transfer ownership first.");
  }

  await prisma.membership.delete({
    where: { userId_businessId: { userId: targetUserId, businessId } },
  });
}

export async function findUserMembership(
  userId: string,
  businessId: string
): Promise<Membership | null> {
  return prisma.membership.findUnique({
    where: { userId_businessId: { userId, businessId } },
  });
}
