import { prisma } from "../prisma";
import { PlatformRole, User } from "@prisma/client";

export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: {
      memberships: {
        include: {
          business: true,
        },
      },
    },
  });
}

export async function findUserByPhone(phone: string): Promise<User | null> {
  return prisma.user.findFirst({
    where: { phone, deletedAt: null },
  });
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = email.toLowerCase().trim();
  return prisma.user.findFirst({
    where: { email: normalized, deletedAt: null },
  });
}

export async function upsertUserByEmail(
  email: string,
  name: string = "User",
  role: PlatformRole = PlatformRole.USER
): Promise<User> {
  const normalized = email.toLowerCase().trim();
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const effectiveRole = adminEmails.includes(normalized) ? PlatformRole.ADMIN : role;

  return prisma.user.upsert({
    where: { email: normalized },
    update: {
      emailVerified: true,
      ...(adminEmails.includes(normalized) ? { role: PlatformRole.ADMIN } : {}),
      updatedAt: new Date(),
    },
    create: {
      email: normalized,
      name: name || normalized.split("@")[0] || "User",
      emailVerified: true,
      role: effectiveRole,
    },
  });
}

export async function upsertUserByPhone(
  phone: string,
  name: string = "User",
  role: PlatformRole = PlatformRole.USER
): Promise<User> {
  const adminPhones = (process.env.ADMIN_PHONES || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const effectiveRole = adminPhones.includes(phone) ? PlatformRole.ADMIN : role;

  return prisma.user.upsert({
    where: { phone },
    update: {
      phoneVerified: true,
      ...(adminPhones.includes(phone) ? { role: PlatformRole.ADMIN } : {}),
      updatedAt: new Date(),
    },
    create: {
      phone,
      name,
      phoneVerified: true,
      role: effectiveRole,
    },
  });
}

export async function updateUserActiveBusiness(
  userId: string,
  activeBusinessId: string | null
): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: { activeBusinessId },
  });
}

export async function anonymizeUser(userId: string): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: {
      name: "Deleted User",
      phone: `deleted_${userId}`,
      deletedAt: new Date(),
      activeBusinessId: null,
    },
  });
}
