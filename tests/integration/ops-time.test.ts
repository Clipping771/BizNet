import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, PlatformRole } from "@prisma/client";
import { logOpsTime, getRecentOpsTimeLogs, getTotalOpsMinutes } from "@/lib/repo/ops-time";
import { assertCan } from "@/lib/authz";

const prisma = new PrismaClient();

describe("Phase 2 - E. Ops-Time Tracking (§17, §7 admin)", () => {
  let adminUser: any;
  let normalUser: any;

  beforeAll(async () => {
    adminUser = await prisma.user.create({
      data: {
        phone: `+8801766660001-${Date.now()}`,
        name: "Ops Admin User",
        role: PlatformRole.ADMIN,
        phoneVerified: true,
      },
    });

    normalUser = await prisma.user.create({
      data: {
        phone: `+8801766660002-${Date.now()}`,
        name: "Normal Non-Admin",
        role: PlatformRole.USER,
        phoneVerified: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.opsTimeLog.deleteMany({
      where: { userId: adminUser.id },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminUser.id, normalUser.id] } },
    });
    await prisma.$disconnect();
  });

  it("E1: allows admin to log operations minutes", async () => {
    const adminCtx = {
      userId: adminUser.id,
      role: PlatformRole.ADMIN,
    };

    expect(() => assertCan(adminCtx, "admin:access")).not.toThrow();

    const entry = await logOpsTime({
      userId: adminUser.id,
      activity: "concierge_buyer_intake",
      minutes: 25,
      refType: "Request",
      refId: "req-12345",
    });

    expect(entry.id).toBeDefined();
    expect(entry.minutes).toBe(25);
    expect(entry.activity).toBe("concierge_buyer_intake");
    expect(entry.userId).toBe(adminUser.id);
  });

  it("E1: denies non-admin user from accessing admin ops time", () => {
    const userCtx = {
      userId: normalUser.id,
      role: PlatformRole.USER,
    };

    expect(() => assertCan(userCtx, "admin:access")).toThrow("Admin access required");
  });

  it("E1: rejects empty activity or invalid minutes", async () => {
    await expect(
      logOpsTime({
        userId: adminUser.id,
        activity: "",
        minutes: 15,
      })
    ).rejects.toThrow("Activity name is required");

    await expect(
      logOpsTime({
        userId: adminUser.id,
        activity: "some_activity",
        minutes: 0,
      })
    ).rejects.toThrow("Minutes must be a positive integer");

    await expect(
      logOpsTime({
        userId: adminUser.id,
        activity: "some_activity",
        minutes: -10,
      })
    ).rejects.toThrow("Minutes must be a positive integer");
  });

  it("E1: computes total minutes logged accurately", async () => {
    const total = await getTotalOpsMinutes();
    expect(total).toBeGreaterThanOrEqual(25);
  });
});
