import { prisma } from "../prisma";
import { OtpCode } from "@prisma/client";

export async function createOtpRecord(
  identifier: { phone?: string; email?: string } | string,
  codeHash: string,
  expiresAt: Date
): Promise<OtpCode> {
  const data =
    typeof identifier === "string"
      ? { phone: identifier, codeHash, expiresAt }
      : {
          phone: identifier.phone ?? null,
          email: identifier.email ? identifier.email.toLowerCase().trim() : null,
          codeHash,
          expiresAt,
        };
  return prisma.otpCode.create({ data });
}

export async function findLatestValidOtp(
  identifier: { phone?: string; email?: string } | string,
  now: Date
): Promise<OtpCode | null> {
  const where =
    typeof identifier === "string"
      ? { phone: identifier, consumedAt: null, expiresAt: { gt: now } }
      : {
          phone: identifier.phone ?? undefined,
          email: identifier.email ? identifier.email.toLowerCase().trim() : undefined,
          consumedAt: null,
          expiresAt: { gt: now },
        };
  return prisma.otpCode.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });
}

export interface ReservedOtpSlot {
  success: boolean;
  id?: string;
  codeHash?: string;
  attempts?: number;
  reason?: string;
}

/**
 * Atomically reserves an OTP verification attempt BEFORE matching the hash.
 * Uses atomic UPDATE ... WHERE attempts < 5 AND consumedAt IS NULL RETURNING attempts, codeHash.
 * Guarantees race safety: even under 100 concurrent requests, at most 5 attempts ever succeed.
 */
export async function atomicReserveOtpAttempt(
  identifier: { phone?: string; email?: string } | string,
  now: Date
): Promise<ReservedOtpSlot> {
  const where =
    typeof identifier === "string"
      ? { phone: identifier, consumedAt: null, expiresAt: { gt: now } }
      : {
          phone: identifier.phone ?? undefined,
          email: identifier.email ? identifier.email.toLowerCase().trim() : undefined,
          consumedAt: null,
          expiresAt: { gt: now },
        };

  const latest = await prisma.otpCode.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });

  if (!latest) {
    return { success: false, reason: "Invalid or expired OTP code" };
  }

  const updated = await prisma.$queryRaw<Array<{ id: string; attempts: number; codeHash: string }>>`
    UPDATE "OtpCode"
    SET "attempts" = "attempts" + 1
    WHERE "id" = ${latest.id}
      AND "attempts" < 5
      AND "consumedAt" IS NULL
      AND "expiresAt" > (NOW() AT TIME ZONE 'utc')
    RETURNING "id", "attempts", "codeHash";
  `;

  if (!updated || updated.length === 0) {
    return {
      success: false,
      reason: "Max attempts exceeded. Please request a new OTP.",
    };
  }

  const row = updated[0];
  return {
    success: true,
    id: row.id,
    codeHash: row.codeHash,
    attempts: Number(row.attempts),
  };
}

/**
 * Atomically increments attempts in SQL.
 */
export async function atomicIncrementOtpAttempts(id: string): Promise<number> {
  const updated = await prisma.otpCode.update({
    where: { id },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  });
  return updated.attempts;
}

/**
 * Atomically marks the OTP as consumed, strictly ensuring attempts <= 5 and consumedAt is null.
 */
export async function atomicConsumeOtp(id: string, now: Date): Promise<boolean> {
  const result = await prisma.otpCode.updateMany({
    where: {
      id,
      consumedAt: null,
      attempts: { lte: 5 },
    },
    data: { consumedAt: now },
  });
  return result.count > 0;
}

export async function incrementOtpAttempts(id: string): Promise<OtpCode> {
  return prisma.otpCode.update({
    where: { id },
    data: { attempts: { increment: 1 } },
  });
}

export async function consumeOtp(id: string, now: Date): Promise<OtpCode> {
  return prisma.otpCode.update({
    where: { id },
    data: { consumedAt: now },
  });
}
