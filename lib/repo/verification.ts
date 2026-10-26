import { prisma } from "@/lib/prisma";
import { VerificationStatus, PlatformRole } from "@prisma/client";

export class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerificationError";
  }
}

/**
 * Validates legal verification status transitions (§8.3, B4).
 * Hierarchy: UNVERIFIED → PENDING → BASIC → VERIFIED.
 * Also supports REJECTED and SUSPENDED states.
 */
export function validateVerificationTransition(
  current: VerificationStatus,
  target: VerificationStatus
): boolean {
  if (current === target) return true;

  switch (current) {
    case VerificationStatus.UNVERIFIED:
      // Can only request verification (become PENDING)
      return target === VerificationStatus.PENDING;

    case VerificationStatus.PENDING:
      // Admin can approve to BASIC or REJECT. (Cannot skip directly to VERIFIED without BASIC checks)
      return target === VerificationStatus.BASIC || target === VerificationStatus.REJECTED;

    case VerificationStatus.BASIC:
      // Can be upgraded to full VERIFIED, re-enter PENDING upon update, or SUSPENDED
      return (
        target === VerificationStatus.VERIFIED ||
        target === VerificationStatus.PENDING ||
        target === VerificationStatus.SUSPENDED
      );

    case VerificationStatus.VERIFIED:
      // Can be SUSPENDED or re-enter PENDING if credentials change
      return (
        target === VerificationStatus.SUSPENDED ||
        target === VerificationStatus.PENDING
      );

    case VerificationStatus.REJECTED:
      // Can re-submit verification (PENDING)
      return target === VerificationStatus.PENDING;

    case VerificationStatus.SUSPENDED:
      // Admin can reinstate to BASIC or VERIFIED, or reset to UNVERIFIED
      return (
        target === VerificationStatus.BASIC ||
        target === VerificationStatus.VERIFIED ||
        target === VerificationStatus.UNVERIFIED
      );

    default:
      return false;
  }
}

export async function submitVerificationRequest(params: {
  businessId: string;
  userId: string;
  tradeLicenseNo?: string | null;
  documentKeys: string[];
  referenceName?: string | null;
  referencePhone?: string | null;
}) {
  const { businessId, userId, tradeLicenseNo, documentKeys, referenceName, referencePhone } = params;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new VerificationError("Business not found");
  }

  if (business.isSuspended) {
    throw new VerificationError("Suspended businesses cannot submit verification");
  }

  if (!validateVerificationTransition(business.verificationStatus, VerificationStatus.PENDING)) {
    throw new VerificationError(
      `Cannot transition from ${business.verificationStatus} to PENDING`
    );
  }

  return prisma.$transaction(async (tx) => {
    const vr = await tx.verificationRequest.create({
      data: {
        businessId,
        submittedByUserId: userId,
        tradeLicenseNo: tradeLicenseNo || null,
        documentKeys,
        referenceName: referenceName || null,
        referencePhone: referencePhone || null,
        status: VerificationStatus.PENDING,
      },
    });

    await tx.business.update({
      where: { id: businessId },
      data: { verificationStatus: VerificationStatus.PENDING },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        actorBusinessId: businessId,
        action: "verification:submit",
        entityType: "VerificationRequest",
        entityId: vr.id,
        before: { status: business.verificationStatus },
        after: { status: VerificationStatus.PENDING },
      },
    });

    return vr;
  });
}

export async function reviewVerificationRequest(params: {
  adminUserId: string;
  requestId: string;
  targetStatus: VerificationStatus;
  minutesSpent: number;
  reviewNote?: string | null;
  checklist?: Record<string, boolean>;
}) {
  const { adminUserId, requestId, targetStatus, minutesSpent, reviewNote, checklist } = params;

  if (!minutesSpent || minutesSpent <= 0) {
    throw new VerificationError("Minutes spent is strictly required and must be greater than 0");
  }

  const vr = await prisma.verificationRequest.findUnique({
    where: { id: requestId },
    include: { business: true },
  });

  if (!vr) {
    throw new VerificationError("Verification request not found");
  }

  const currentBusinessStatus = vr.business.verificationStatus;

  if (!validateVerificationTransition(currentBusinessStatus, targetStatus)) {
    throw new VerificationError(
      `Illegal verification transition: ${currentBusinessStatus} -> ${targetStatus}`
    );
  }

  return prisma.$transaction(async (tx) => {
    const updatedVr = await tx.verificationRequest.update({
      where: { id: requestId },
      data: {
        status: targetStatus,
        reviewerUserId: adminUserId,
        reviewNote: reviewNote || null,
        minutesSpent,
        checklist: checklist || {},
      },
    });

    const isVerified =
      targetStatus === VerificationStatus.BASIC ||
      targetStatus === VerificationStatus.VERIFIED;

    await tx.business.update({
      where: { id: vr.businessId },
      data: {
        verificationStatus: targetStatus,
        verifiedAt: isVerified ? new Date() : vr.business.verifiedAt,
        isSuspended: targetStatus === VerificationStatus.SUSPENDED ? true : vr.business.isSuspended,
      },
    });

    // Mandatory OpsTimeLog (§17, B3)
    await tx.opsTimeLog.create({
      data: {
        userId: adminUserId,
        activity: "verification_review",
        minutes: minutesSpent,
        refType: "VerificationRequest",
        refId: requestId,
      },
    });

    // Mandatory AuditLog (§10, B3)
    await tx.auditLog.create({
      data: {
        actorUserId: adminUserId,
        actorBusinessId: vr.businessId,
        action: "verification:review",
        entityType: "VerificationRequest",
        entityId: requestId,
        before: { status: currentBusinessStatus },
        after: {
          status: targetStatus,
          minutesSpent,
          reviewNote: reviewNote || null,
          checklist: checklist || {},
        },
      },
    });

    return updatedVr;
  });
}

export async function getPendingVerifications() {
  return prisma.verificationRequest.findMany({
    where: { status: VerificationStatus.PENDING },
    include: {
      business: true,
      submittedBy: {
        select: { id: true, name: true, phone: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestVerificationForBusiness(businessId: string) {
  return prisma.verificationRequest.findFirst({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
}
