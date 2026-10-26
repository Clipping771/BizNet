import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, MemberRole, PlatformRole, InviteRole } from "@prisma/client";
import { assertCan, AuthorizationError } from "../../lib/authz";
import { createBusiness } from "../../lib/repo/business";
import {
  createMemberInvite,
  acceptMemberInvite,
  initiateOwnershipTransfer,
  confirmOwnershipTransfer,
  removeMember,
  countUserOwnedBusinesses,
} from "../../lib/repo/membership";
import { upsertUserByPhone, anonymizeUser, findUserById } from "../../lib/repo/user";
import { checkRateLimit } from "../../lib/ratelimit";
import { hashOtp, verifyOtpHash, isDevTestPhone } from "../../lib/otp";
import { getClientIp } from "../../lib/ip";
import { NextRequest } from "next/server";
import {
  createOtpRecord,
  atomicIncrementOtpAttempts,
  atomicConsumeOtp,
  atomicReserveOtpAttempt,
  findLatestValidOtp,
} from "../../lib/repo/otp";

const prisma = new PrismaClient();

describe("Phase 1: Authorization, IDOR & Ownership Transfer Tests", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Table-Driven Permission Matrix & Denials", () => {
    const cases = [
      {
        name: "Unverified user cannot create business",
        ctx: { userId: "u1", role: PlatformRole.USER, phoneVerified: false },
        action: "business:create" as const,
        shouldPass: false,
      },
      {
        name: "Verified user can create business",
        ctx: { userId: "u1", role: PlatformRole.USER, phoneVerified: true },
        action: "business:create" as const,
        shouldPass: true,
      },
      {
        name: "STAFF cannot edit business profile",
        ctx: {
          userId: "u1",
          role: PlatformRole.USER,
          activeBusinessId: "b1",
          businessRole: MemberRole.STAFF,
        },
        action: "business:edit" as const,
        resource: { businessId: "b1" },
        shouldPass: false,
      },
      {
        name: "MANAGER can edit business profile",
        ctx: {
          userId: "u1",
          role: PlatformRole.USER,
          activeBusinessId: "b1",
          businessRole: MemberRole.MANAGER,
        },
        action: "business:edit" as const,
        resource: { businessId: "b1" },
        shouldPass: true,
      },
      {
        name: "MANAGER cannot invite members (OWNER only)",
        ctx: {
          userId: "u1",
          role: PlatformRole.USER,
          activeBusinessId: "b1",
          businessRole: MemberRole.MANAGER,
        },
        action: "business:invite" as const,
        resource: { businessId: "b1" },
        shouldPass: false,
      },
      {
        name: "OWNER can invite members",
        ctx: {
          userId: "u1",
          role: PlatformRole.USER,
          activeBusinessId: "b1",
          businessRole: MemberRole.OWNER,
        },
        action: "business:invite" as const,
        resource: { businessId: "b1" },
        shouldPass: true,
      },
      {
        name: "STAFF cannot manage invitations",
        ctx: {
          userId: "u1",
          role: PlatformRole.USER,
          activeBusinessId: "b1",
          businessRole: MemberRole.STAFF,
        },
        action: "business:invite" as const,
        resource: { businessId: "b1" },
        shouldPass: false,
      },
      {
        name: "MANAGER cannot transfer business ownership",
        ctx: {
          userId: "u1",
          role: PlatformRole.USER,
          activeBusinessId: "b1",
          businessRole: MemberRole.MANAGER,
        },
        action: "business:transfer_ownership" as const,
        resource: { businessId: "b1" },
        shouldPass: false,
      },
      {
        name: "OWNER can transfer business ownership",
        ctx: {
          userId: "u1",
          role: PlatformRole.USER,
          activeBusinessId: "b1",
          businessRole: MemberRole.OWNER,
        },
        action: "business:transfer_ownership" as const,
        resource: { businessId: "b1" },
        shouldPass: true,
      },
      {
        name: "ADMIN can access admin panel",
        ctx: { userId: "admin-1", role: PlatformRole.ADMIN },
        action: "admin:access" as const,
        shouldPass: true,
      },
      {
        name: "Regular USER cannot access admin panel",
        ctx: { userId: "user-1", role: PlatformRole.USER },
        action: "admin:access" as const,
        shouldPass: false,
      },
      {
        name: "Supplier can create quotes",
        ctx: {
          userId: "u1",
          role: PlatformRole.USER,
          activeBusinessId: "b-sup",
          businessRole: MemberRole.STAFF,
        },
        action: "quote:create" as const,
        resource: { supplierBusinessId: "b-sup" },
        shouldPass: true,
      },
      {
        name: "Non-supplier cannot create quotes",
        ctx: {
          userId: "u1",
          role: PlatformRole.USER,
          activeBusinessId: "b-buy",
          businessRole: MemberRole.STAFF,
        },
        action: "quote:create" as const,
        resource: { supplierBusinessId: "b-sup" },
        shouldPass: false,
      },
    ];

    cases.forEach((tc) => {
      it(tc.name, () => {
        if (tc.shouldPass) {
          expect(() => assertCan(tc.ctx, tc.action, tc.resource)).not.toThrow();
        } else {
          expect(() => assertCan(tc.ctx, tc.action, tc.resource)).toThrow(AuthorizationError);
        }
      });
    });

    it("should reject cross-tenant business editing", () => {
      const ctx = {
        userId: "user-tenant-a",
        role: PlatformRole.USER,
        activeBusinessId: "biz-a",
        businessRole: MemberRole.OWNER,
      };

      expect(() => {
        assertCan(ctx, "business:edit", { businessId: "biz-b" });
      }).toThrow(AuthorizationError);
    });

    it("should reject cross-tenant quote acceptance", () => {
      const ctx = {
        userId: "user-buyer-a",
        role: PlatformRole.USER,
        activeBusinessId: "buyer-a",
        businessRole: MemberRole.OWNER,
      };

      expect(() => {
        assertCan(ctx, "quote:accept", { buyerBusinessId: "buyer-b" });
      }).toThrow(AuthorizationError);
    });
  });

  describe("Single Owner Invariant & Bug Regressions", () => {
    it("prevents owner from accepting a staff invite and leaving the business with 0 owners", async () => {
      const owner = await upsertUserByPhone("+8801822222201", "Owner User");
      const business = await createBusiness(owner.id, {
        name: "Zero Owner Bug Test",
        businessType: "Packaging",
        isBuyer: true,
        isSupplier: false,
        area: "Dhanmondi",
        city: "Dhaka",
      });

      // Generate a STAFF invite
      const invite = await createMemberInvite(
        business.id,
        owner.id,
        owner.phone!,
        InviteRole.STAFF
      );

      // Attempt by OWNER to accept their own staff invite must be REJECTED
      await expect(acceptMemberInvite(invite.rawToken, owner.id)).rejects.toThrow(
        "Current OWNER cannot accept a staff/manager invitation for their own business"
      );

      // Verify business STILL has exactly 1 OWNER
      const ownerCount = await prisma.membership.count({
        where: { businessId: business.id, role: MemberRole.OWNER },
      });
      expect(ownerCount).toBe(1);
    });

    it("rejects invite acceptance when account phone number does not match invite phone", async () => {
      const owner = await upsertUserByPhone("+8801822222202", "Owner User 2");
      const intendedUser = await upsertUserByPhone("+8801822222203", "Intended Member");
      const impostorUser = await upsertUserByPhone("+8801822222204", "Impostor Member");

      const business = await createBusiness(owner.id, {
        name: "Phone Match Test",
        businessType: "Packaging",
        isBuyer: true,
        isSupplier: false,
        area: "Mirpur",
        city: "Dhaka",
      });

      const invite = await createMemberInvite(
        business.id,
        owner.id,
        intendedUser.phone!,
        InviteRole.STAFF
      );

      // Impostor attempts to accept token
      await expect(acceptMemberInvite(invite.rawToken, impostorUser.id)).rejects.toThrow(
        "Invitation phone number does not match your account phone number"
      );

      // Intended user accepts -> succeeds
      const membership = await acceptMemberInvite(invite.rawToken, intendedUser.id);
      expect(membership.role).toBe(MemberRole.STAFF);
    });

    it("rejects confirming ownership transfer if the initiator is no longer the OWNER", async () => {
      const owner = await upsertUserByPhone("+8801822222205", "Owner User 3");
      const member = await upsertUserByPhone("+8801822222206", "Member User 3");

      const business = await createBusiness(owner.id, {
        name: "Transfer Revoke Test",
        businessType: "Packaging",
        isBuyer: true,
        isSupplier: false,
        area: "Uttara",
        city: "Dhaka",
      });

      await prisma.membership.create({
        data: {
          userId: member.id,
          businessId: business.id,
          role: MemberRole.STAFF,
        },
      });

      const transfer = await initiateOwnershipTransfer(business.id, owner.id, member.id);

      // Demote owner out-of-band before confirmation
      await prisma.membership.update({
        where: { userId_businessId: { userId: owner.id, businessId: business.id } },
        data: { role: MemberRole.MANAGER },
      });

      // Member attempts to confirm -> must be rejected
      await expect(confirmOwnershipTransfer(transfer.transferId, member.id)).rejects.toThrow(
        "Transfer initiator is no longer the OWNER of this business"
      );
    });

    it("enforces atomic role swap and exactly one OWNER invariant on valid transfer", async () => {
      const owner = await upsertUserByPhone("+8801822222207", "Original Owner 4");
      const member = await upsertUserByPhone("+8801822222208", "New Owner 4");

      const business = await createBusiness(owner.id, {
        name: "Atomic Swap Test",
        businessType: "Packaging",
        isBuyer: true,
        isSupplier: false,
        area: "Mohammadpur",
        city: "Dhaka",
      });

      await prisma.membership.create({
        data: {
          userId: member.id,
          businessId: business.id,
          role: MemberRole.STAFF,
        },
      });

      const transfer = await initiateOwnershipTransfer(business.id, owner.id, member.id);
      await confirmOwnershipTransfer(transfer.transferId, member.id);

      const oldOwner = await prisma.membership.findUnique({
        where: { userId_businessId: { userId: owner.id, businessId: business.id } },
      });
      const newOwner = await prisma.membership.findUnique({
        where: { userId_businessId: { userId: member.id, businessId: business.id } },
      });

      expect(oldOwner?.role).toBe(MemberRole.MANAGER);
      expect(newOwner?.role).toBe(MemberRole.OWNER);

      const totalOwners = await prisma.membership.count({
        where: { businessId: business.id, role: MemberRole.OWNER },
      });
      expect(totalOwners).toBe(1);
    });
  });

  describe("Account Anonymization & Deletion", () => {
    it("anonymizes phone and personal information while preserving referential integrity", async () => {
      const user = await upsertUserByPhone("+8801833333301", "Anonymize Me");
      const business = await createBusiness(user.id, {
        name: "Anonymized Business",
        businessType: "Packaging",
        isBuyer: true,
        isSupplier: false,
        area: "Mirpur",
        city: "Dhaka",
      });

      expect(user.phone).toBe("+8801833333301");

      const anonymized = await anonymizeUser(user.id);
      expect(anonymized.name).toBe("Deleted User");
      expect(anonymized.phone).toBe(`deleted_${user.id}`);
      expect(anonymized.deletedAt).not.toBeNull();
      expect(anonymized.activeBusinessId).toBeNull();

      // Business membership record still references the user row without foreign key violation
      const membership = await prisma.membership.findFirst({
        where: { businessId: business.id, userId: user.id },
      });
      expect(membership).toBeDefined();
    });
  });

  describe("Atomic Rate Limiting & Concurrency", () => {
    it("allows exactly the limit and blocks excess requests under concurrency", async () => {
      const testKey = `test:ratelimit:${Date.now()}`;
      const limit = 3;
      const windowSeconds = 60;

      // 10 concurrent requests
      const promises = Array.from({ length: 10 }).map(() =>
        checkRateLimit(testKey, limit, windowSeconds)
      );

      const results = await Promise.all(promises);
      const passed = results.filter((r) => r.success);
      const blocked = results.filter((r) => !r.success);

      expect(passed.length).toBe(3);
      expect(blocked.length).toBe(7);
    });

    it("X-Forwarded-For anti-spoofing: extracts rightmost trusted IP and blocks rate-limit bypass by header spoofing", async () => {
      const prevTrust = process.env.TRUST_PROXY;
      process.env.TRUST_PROXY = "nginx";
      try {
        // Attacker attempts to bypass 10-per-IP limit by spoofing leftmost IP
        const trustedUpstreamIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;

        // Simulate Request 1 with spoofed client IP
        const req1 = new NextRequest("http://localhost:3000/api/auth/otp/send", {
          headers: {
            "x-forwarded-for": `1.2.3.4, 10.0.0.1, ${trustedUpstreamIp}`,
          },
        });

        // Simulate Request 2 with different spoofed client IP
        const req2 = new NextRequest("http://localhost:3000/api/auth/otp/send", {
          headers: {
            "x-forwarded-for": `99.88.77.66, 172.16.0.5, ${trustedUpstreamIp}`,
          },
        });

        // Both must resolve to the identical trustedUpstreamIp
        const ip1 = getClientIp(req1);
        const ip2 = getClientIp(req2);

        expect(ip1).toBe(trustedUpstreamIp);
        expect(ip2).toBe(trustedUpstreamIp);

        // Verify that rate limits hit the same bucket
        const limitKey = `otp:ip:${ip1}`;
        const res1 = await checkRateLimit(limitKey, 1, 60);
        const res2 = await checkRateLimit(limitKey, 1, 60);

        expect(res1.success).toBe(true);
        expect(res2.success).toBe(false); // Second request blocked despite client changing spoofed IP!
      } finally {
        if (prevTrust) {
          process.env.TRUST_PROXY = prevTrust;
        } else {
          delete process.env.TRUST_PROXY;
        }
      }
    });
  });

  describe("Single Owner Account Deletion Invariant", () => {
    it("prevents deleting account while user is OWNER of an active business", async () => {
      const owner = await upsertUserByPhone("+8801855555501", "Business Owner");
      const member = await upsertUserByPhone("+8801855555502", "Business Member");

      const business = await createBusiness(owner.id, {
        name: "Owner Deletion Guard Test",
        businessType: "Packaging",
        isBuyer: true,
        isSupplier: false,
        area: "Mirpur",
        city: "Dhaka",
        addressLine: "Mirpur-10, Dhaka",
      });

      await prisma.membership.create({
        data: {
          userId: member.id,
          businessId: business.id,
          role: MemberRole.STAFF,
        },
      });

      // 1. Verify owner owns 1 business
      const ownedBefore = await countUserOwnedBusinesses(owner.id);
      expect(ownedBefore).toBe(1);

      // 2. Transfer ownership to member
      const transfer = await initiateOwnershipTransfer(business.id, owner.id, member.id);
      await confirmOwnershipTransfer(transfer.transferId, member.id);

      // 3. Former owner is now MANAGER, owns 0 businesses
      const ownedAfter = await countUserOwnedBusinesses(owner.id);
      expect(ownedAfter).toBe(0);

      // 4. Now former owner can be safely anonymized/deleted
      const anonymized = await anonymizeUser(owner.id);
      expect(anonymized.deletedAt).not.toBeNull();

      // 5. Business still has its new OWNER
      const currentOwner = await prisma.membership.findFirst({
        where: { businessId: business.id, role: MemberRole.OWNER },
      });
      expect(currentOwner?.userId).toBe(member.id);
    });

    it("invalidates session lookups for deleted users (findUserById returns null)", async () => {
      const user = await upsertUserByPhone("+8801866666601", "To Be Deleted");
      expect(await findUserById(user.id)).not.toBeNull();

      await anonymizeUser(user.id);

      // Subsequent lookups by id for session validation return null
      const lookup = await findUserById(user.id);
      expect(lookup).toBeNull();
    });
  });

  describe("OTP Verification & Concurrency Security", () => {
    it("REAL CONCURRENT OTP RACE TEST: 20 simultaneous verification attempts allow exactly 5 attempts and lock all remaining", async () => {
      const testPhone = `+88018777777${Math.floor(Math.random() * 90) + 10}`;
      const correctCode = "654321";
      const codeHash = hashOtp(correctCode);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const otp = await createOtpRecord(testPhone, codeHash, expiresAt);
      expect(otp.attempts).toBe(0);

      const now = new Date();

      // Fire 20 CONCURRENT verification attempts simultaneously with wrong guesses
      const concurrentPromises = Array.from({ length: 20 }).map((_, idx) =>
        atomicReserveOtpAttempt(testPhone, now)
      );

      const results = await Promise.all(concurrentPromises);

      const passedSlots = results.filter((r) => r.success);
      const blockedSlots = results.filter((r) => !r.success);

      // EXACTLY 5 attempts can ever pass the WHERE attempts < 5 condition
      expect(passedSlots.length).toBe(5);
      // All remaining 15 are immediately blocked with "Max attempts exceeded"
      expect(blockedSlots.length).toBe(15);
      expect(blockedSlots[0].reason).toContain("Max attempts exceeded");

      // Verify in DB that attempts is exactly 5
      const recordInDb = await prisma.otpCode.findUnique({ where: { id: otp.id } });
      expect(recordInDb?.attempts).toBe(5);

      // Verify that any subsequent attempt (even with correct code) is completely locked out
      const nextAttempt = await atomicReserveOtpAttempt(testPhone, now);
      expect(nextAttempt.success).toBe(false);
      expect(nextAttempt.reason).toContain("Max attempts exceeded");
    });

    it("verifies dev test bypass works only on designated dev test phones and only when NODE_ENV=development", () => {
      const devPhone = "+8801700000001";
      const normalPhone = "+8801899999999";
      const originalEnv = process.env.NODE_ENV;

      try {
        (process.env as any).NODE_ENV = "development";
        expect(isDevTestPhone(devPhone)).toBe(true);
        expect(isDevTestPhone(normalPhone)).toBe(false);

        (process.env as any).NODE_ENV = "test";
        expect(isDevTestPhone(devPhone)).toBe(false);
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
      }
    });
  });
});
