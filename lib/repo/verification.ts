import { prisma } from "@/lib/prisma";
import { VerificationStatus, PlatformRole } from "@prisma/client";

export class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerificationError";
  }
}

/**
 * Validates legal business verification status transitions (§8.3, B4).
 * Hierarchy: UNVERIFIED → PENDING → BASIC → VERIFIED, plus REJECTED and SUSPENDED.
 * A BASIC/VERIFIED business asking for an upgrade keeps its level while the
 * request is reviewed, so BASIC/VERIFIED never move back to PENDING.
 */
export function validateVerificationTransition(
  current: VerificationStatus,
  target: VerificationStatus
): boolean {
  if (current === target) return true;

  switch (current) {
    case VerificationStatus.UNVERIFIED:
      return target === VerificationStatus.PENDING;

    case VerificationStatus.PENDING:
      // VERIFIED directly is allowed when BASIC checks and the license check pass together
      return (
        target === VerificationStatus.BASIC ||
        target === VerificationStatus.VERIFIED ||
        target === VerificationStatus.REJECTED ||
        target === VerificationStatus.SUSPENDED
      );

    case VerificationStatus.BASIC:
      return target === VerificationStatus.VERIFIED || target === VerificationStatus.SUSPENDED;

    case VerificationStatus.VERIFIED:
      return target === VerificationStatus.SUSPENDED;

    case VerificationStatus.REJECTED:
      return target === VerificationStatus.PENDING || target === VerificationStatus.SUSPENDED;

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

const VERIFIED_LEVELS: VerificationStatus[] = [VerificationStatus.BASIC, VerificationStatus.VERIFIED];

/** Decisions an admin can take on a PENDING verification request. */
export const REVIEW_DECISIONS: VerificationStatus[] = [
  VerificationStatus.BASIC,
  VerificationStatus.VERIFIED,
  VerificationStatus.REJECTED,
  VerificationStatus.SUSPENDED,
];

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

  if (business.isSuspended || business.verificationStatus === VerificationStatus.SUSPENDED) {
    throw new VerificationError("Suspended businesses cannot submit verification");
  }

  // Documents must have been uploaded for this business (see businessFilePrefix)
  const allowedPrefix = `private/verification/${businessId}/`;
  if (documentKeys.some((k) => typeof k !== "string" || !k.startsWith(allowedPrefix) || k.includes(".."))) {
    throw new VerificationError("Invalid verification document reference");
  }

  const pending = await prisma.verificationRequest.findFirst({
    where: { businessId, status: VerificationStatus.PENDING },
    select: { id: true },
  });
  if (pending) {
    throw new VerificationError("A verification request is already pending review");
  }

  // An upgrade request (BASIC → VERIFIED) leaves the current level in place
  const keepsLevel = VERIFIED_LEVELS.includes(business.verificationStatus);
  if (!keepsLevel && !validateVerificationTransition(business.verificationStatus, VerificationStatus.PENDING)) {
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

    if (!keepsLevel) {
      await tx.business.update({
        where: { id: businessId },
        data: { verificationStatus: VerificationStatus.PENDING },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        actorBusinessId: businessId,
        action: "verification:submit",
        entityType: "VerificationRequest",
        entityId: vr.id,
        before: { status: business.verificationStatus },
        after: {
          status: keepsLevel ? business.verificationStatus : VerificationStatus.PENDING,
          request: VerificationStatus.PENDING,
        },
      },
    });

    return vr;
  });
}

/**
 * Admin decision on a PENDING request. Only one review can ever win: the request
 * is claimed with a conditional update inside the transaction.
 */
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
  if (!REVIEW_DECISIONS.includes(targetStatus)) {
    throw new VerificationError(`Invalid review decision: ${targetStatus}`);
  }

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.verificationRequest.updateMany({
      where: { id: requestId, status: VerificationStatus.PENDING },
      data: {
        status: targetStatus,
        reviewerUserId: adminUserId,
        reviewNote: reviewNote || null,
        minutesSpent,
        checklist: checklist || {},
      },
    });
    if (claimed.count !== 1) {
      throw new VerificationError("Verification request not found or already reviewed");
    }

    const vr = await tx.verificationRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { business: true },
    });
    const currentBusinessStatus = vr.business.verificationStatus;

    // A rejected upgrade request leaves an already BASIC/VERIFIED business as it was
    let businessStatus = targetStatus;
    if (targetStatus === VerificationStatus.REJECTED && VERIFIED_LEVELS.includes(currentBusinessStatus)) {
      businessStatus = currentBusinessStatus;
    }
    if (
      businessStatus !== currentBusinessStatus &&
      !validateVerificationTransition(currentBusinessStatus, businessStatus)
    ) {
      throw new VerificationError(
        `Illegal verification transition: ${currentBusinessStatus} -> ${businessStatus}`
      );
    }

    await tx.business.update({
      where: { id: vr.businessId },
      data: {
        verificationStatus: businessStatus,
        verifiedAt:
          VERIFIED_LEVELS.includes(businessStatus) && businessStatus !== currentBusinessStatus
            ? new Date()
            : vr.business.verifiedAt,
        isSuspended: businessStatus === VerificationStatus.SUSPENDED,
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
          status: businessStatus,
          decision: targetStatus,
          minutesSpent,
          reviewNote: reviewNote || null,
          checklist: checklist || {},
        },
      },
    });

    const { business: _business, ...updatedVr } = vr;
    return updatedVr;
  });
}

/**
 * Admin changes a business's level outside a request: suspend or reinstate.
 * Keeps isSuspended in sync with the status.
 */
export async function setBusinessVerificationStatus(params: {
  adminUserId: string;
  businessId: string;
  targetStatus: VerificationStatus;
  minutesSpent: number;
  note?: string | null;
}) {
  const { adminUserId, businessId, targetStatus, minutesSpent, note } = params;
  if (!minutesSpent || minutesSpent <= 0) {
    throw new VerificationError("Minutes spent is strictly required and must be greater than 0");
  }

  return prisma.$transaction(async (tx) => {
    const business = await tx.business.findUnique({ where: { id: businessId } });
    if (!business) throw new VerificationError("Business not found");
    if (!validateVerificationTransition(business.verificationStatus, targetStatus)) {
      throw new VerificationError(
        `Illegal verification transition: ${business.verificationStatus} -> ${targetStatus}`
      );
    }

    const updated = await tx.business.update({
      where: { id: businessId },
      data: {
        verificationStatus: targetStatus,
        isSuspended: targetStatus === VerificationStatus.SUSPENDED,
      },
    });

    await tx.opsTimeLog.create({
      data: {
        userId: adminUserId,
        activity: "verification_status_change",
        minutes: minutesSpent,
        refType: "Business",
        refId: businessId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: adminUserId,
        actorBusinessId: businessId,
        action: "verification:status_change",
        entityType: "Business",
        entityId: businessId,
        before: { status: business.verificationStatus, isSuspended: business.isSuspended },
        after: { status: targetStatus, isSuspended: updated.isSuspended, note: note || null },
      },
    });

    return updated;
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
