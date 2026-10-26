import { prisma } from "../prisma";
import { Passkey } from "@prisma/client";

export async function savePasskeyChallenge(
  challenge: string,
  userId?: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  await prisma.passkeyChallenge.create({
    data: {
      challenge,
      userId,
      expiresAt,
    },
  });
}

export async function findAndConsumePasskeyChallenge(
  challenge: string
): Promise<{ valid: boolean; userId?: string | null }> {
  const now = new Date();
  const record = await prisma.passkeyChallenge.findUnique({
    where: { challenge },
  });

  if (!record || record.expiresAt < now) {
    if (record) {
      await prisma.passkeyChallenge.delete({ where: { id: record.id } }).catch(() => {});
    }
    return { valid: false };
  }

  // Delete consumed challenge
  await prisma.passkeyChallenge.delete({ where: { id: record.id } }).catch(() => {});
  return { valid: true, userId: record.userId };
}

export async function findPasskeyByCredentialId(
  credentialId: string
): Promise<(Passkey & { user: any }) | null> {
  return prisma.passkey.findUnique({
    where: { credentialId },
    include: {
      user: {
        include: {
          memberships: true,
        },
      },
    },
  });
}

export async function createPasskey(data: {
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: bigint;
  deviceType?: string;
  backedUp?: boolean;
  transports?: string[];
  name?: string;
}): Promise<Passkey> {
  return prisma.passkey.create({
    data: {
      userId: data.userId,
      credentialId: data.credentialId,
      publicKey: data.publicKey,
      counter: data.counter,
      deviceType: data.deviceType,
      backedUp: data.backedUp ?? false,
      transports: data.transports || [],
      name: data.name || "Passkey",
    },
  });
}

export async function updatePasskeyCounter(
  id: string,
  counter: bigint
): Promise<Passkey> {
  return prisma.passkey.update({
    where: { id },
    data: {
      counter,
      lastUsedAt: new Date(),
    },
  });
}

export async function listUserPasskeys(userId: string): Promise<Passkey[]> {
  return prisma.passkey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
