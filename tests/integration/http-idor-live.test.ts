import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../lib/prisma";
import { normalizePhone, isValidBdPhone } from "../../lib/phone";
import { getClientIp } from "../../lib/ip";
import { isDevTestPhone } from "../../lib/otp";
import { sealData } from "iron-session";
import { sessionOptions } from "../../lib/session";
import { POST as sendOtpRoute } from "../../app/api/auth/otp/send/route";
import { POST as createBusinessRoute } from "../../app/api/business/route";
import { POST as switchBusinessRoute } from "../../app/api/business/switch/route";
import { POST as createInviteRoute } from "../../app/api/business/invites/route";
import { DELETE as revokeInviteRoute } from "../../app/api/business/invites/[id]/route";
import { POST as transferOwnershipRoute } from "../../app/api/business/ownership/transfer/route";
import { upsertUserByPhone, upsertUserByEmail } from "../../lib/repo/user";
import { createBusiness } from "../../lib/repo/business";
import { createMemberInvite } from "../../lib/repo/membership";
import { checkRateLimit } from "../../lib/ratelimit";

// Helper to create sealed session cookies
async function makeSessionCookie(data: {
  userId: string;
  phone?: string;
  email?: string;
  role?: "USER" | "ADMIN";
  activeBusinessId?: string;
  businessRole?: "OWNER" | "MANAGER" | "STAFF";
}): Promise<string> {
  const sealed = await sealData({ ...data, isLoggedIn: true }, sessionOptions);
  return `biznet_session=${sealed}`;
}

describe("Phase 1 Security Invariants: IDOR, IP Anti-Spoofing, BD Phone Regex & Verification Guards", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("1. Bangladeshi Phone Number Regex Hardening (§8.1)", () => {
    it("rejects +88017220001 (only 9 digits after 880, too short)", () => {
      const normalized = normalizePhone("+88017220001");
      expect(normalized).toBeNull();
      expect(isValidBdPhone("+88017220001")).toBe(false);
    });

    it("rejects +8801212345678 (invalid operator 012)", () => {
      const normalized = normalizePhone("+8801212345678");
      expect(normalized).toBeNull();
      expect(isValidBdPhone("+8801212345678")).toBe(false);
    });

    it("rejects local 017220001 and 01212345678", () => {
      expect(normalizePhone("017220001")).toBeNull();
      expect(normalizePhone("01212345678")).toBeNull();
    });

    it("accepts valid BD numbers (+88013.. to +88019..)", () => {
      expect(normalizePhone("+8801712345678")).toBe("+8801712345678");
      expect(normalizePhone("01712345678")).toBe("+8801712345678");
      expect(normalizePhone("+8801987654321")).toBe("+8801987654321");
    });

    it("API route /api/auth/otp/send returns HTTP 400 for malformed BD numbers", async () => {
      const req1 = new NextRequest("http://localhost:3000/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+88017220001" }),
      });
      const res1 = await sendOtpRoute(req1);
      expect(res1.status).toBe(400);

      const req2 = new NextRequest("http://localhost:3000/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+8801212345678" }),
      });
      const res2 = await sendOtpRoute(req2);
      expect(res2.status).toBe(400);
    });
  });

  describe("2. IP Extraction & Rate Limiting Isolation (Next.js 15 & TRUST_PROXY=nginx)", () => {
    it("isolates 2 distinct upstream IPs into separate rate limit buckets, ignoring leftmost spoofed IP", async () => {
      const prevTrust = process.env.TRUST_PROXY;
      try {
        process.env.TRUST_PROXY = "nginx";
        await prisma.rateLimitBucket.deleteMany({
          where: { OR: [{ key: { contains: "198.51.100.1" } }, { key: { contains: "203.0.113.2" } }] },
        });

        const realIp1 = "198.51.100.1";
        const realIp2 = "203.0.113.2";
        const spoofedClientIp = "10.0.0.99, 172.16.0.1";

        const req1 = new NextRequest("http://localhost:3000/api/auth/otp/send", {
          headers: { "x-forwarded-for": `${spoofedClientIp}, ${realIp1}` },
        });
        const req2 = new NextRequest("http://localhost:3000/api/auth/otp/send", {
          headers: { "x-forwarded-for": `${spoofedClientIp}, ${realIp2}` },
        });

        const extractedIp1 = getClientIp(req1);
        const extractedIp2 = getClientIp(req2);

        expect(extractedIp1).toBe(realIp1);
        expect(extractedIp2).toBe(realIp2);

        // Exhaust bucket for IP 1
        const limitKey1 = `test:ip:${extractedIp1}`;
        const limitKey2 = `test:ip:${extractedIp2}`;

        const hit1 = await checkRateLimit(limitKey1, 1, 60);
        expect(hit1.success).toBe(true);

        const hit1Again = await checkRateLimit(limitKey1, 1, 60);
        expect(hit1Again.success).toBe(false); // IP 1 bucket blocked

        // IP 2 must still succeed because it is in a separate bucket!
        const hit2 = await checkRateLimit(limitKey2, 1, 60);
        expect(hit2.success).toBe(true);
      } finally {
        if (prevTrust) process.env.TRUST_PROXY = prevTrust;
      }
    });

    it("throws critical configuration error in production if TRUST_PROXY is missing", () => {
      const prevTrust = process.env.TRUST_PROXY;
      const prevEnv = process.env.NODE_ENV;
      try {
        delete process.env.TRUST_PROXY;
        (process.env as any).NODE_ENV = "production";

        const req = new NextRequest("http://localhost:3000/api/auth/otp/send");
        expect(() => getClientIp(req)).toThrowError(/CRITICAL SECURITY CONFIGURATION ERROR/);
      } finally {
        if (prevTrust) process.env.TRUST_PROXY = prevTrust;
        (process.env as any).NODE_ENV = prevEnv;
      }
    });
  });

  describe("3. Real HTTP Request IDOR Prevention (Tenant Isolation)", () => {
    let userA: any;
    let userB: any;
    let bizA: any;
    let bizB: any;
    let cookieA: string;
    let cookieB: string;

    beforeAll(async () => {
      userA = await upsertUserByPhone("+8801711111111", "Owner A");
      userB = await upsertUserByPhone("+8801722222222", "Owner B");

      bizA = await createBusiness(userA.id, {
        name: "Enterprise Alpha",
        businessType: "Packaging",
        isBuyer: true,
        isSupplier: false,
        area: "Motijheel",
        city: "Dhaka",
        addressLine: "Alpha Tower",
      });

      bizB = await createBusiness(userB.id, {
        name: "Enterprise Beta",
        businessType: "Packaging",
        isBuyer: true,
        isSupplier: false,
        area: "Gulshan",
        city: "Dhaka",
        addressLine: "Beta Square",
      });

      cookieA = await makeSessionCookie({
        userId: userA.id,
        phone: userA.phone,
        activeBusinessId: bizA.id,
        businessRole: "OWNER",
      });

      cookieB = await makeSessionCookie({
        userId: userB.id,
        phone: userB.phone,
        activeBusinessId: bizB.id,
        businessRole: "OWNER",
      });
    });

    it("IDOR: User B cannot switch active business to Business A (HTTP 403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/business/switch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieB,
        },
        body: JSON.stringify({ businessId: bizA.id }),
      });

      const res = await switchBusinessRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Forbidden");
    });

    it("IDOR: User B cannot revoke an invitation created for Business A (HTTP 403)", async () => {
      // Create an invite in Business A by User A
      const invite = await createMemberInvite(bizA.id, userA.id, "+8801733333333", "STAFF");

      // User B attempts to revoke it
      const req = new NextRequest(`http://localhost:3000/api/business/invites/${invite.inviteId}`, {
        method: "DELETE",
        headers: { Cookie: cookieB },
      });

      const res = await revokeInviteRoute(req, { params: Promise.resolve({ id: invite.inviteId }) });
      expect([400, 403]).toContain(res.status);
    });

    it("IDOR: User B cannot transfer ownership of Business A even with a forged activeBusinessId (HTTP 400)", async () => {
      // User B attempts to forge a session where activeBusinessId is bizA.id
      const forgedCookie = await makeSessionCookie({
        userId: userB.id,
        phone: userB.phone,
        activeBusinessId: bizA.id,
        businessRole: "OWNER",
      });

      const req = new NextRequest("http://localhost:3000/api/business/ownership/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: forgedCookie,
        },
        body: JSON.stringify({ toUserId: userB.id }),
      });

      const res = await transferOwnershipRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("OWNER");
    });
  });

  describe("4. Business Creation Verification Guard", () => {
    it("blocks business creation if user is unverified (both phoneVerified and emailVerified are false)", async () => {
      const dynamicPhone = `+88019${Date.now().toString().slice(-8)}`;
      const unverifiedUser = await prisma.user.create({
        data: {
          name: "Unverified User",
          phone: dynamicPhone,
          phoneVerified: false,
          emailVerified: false,
        },
      });

      const unverifiedCookie = await makeSessionCookie({
        userId: unverifiedUser.id,
        phone: unverifiedUser.phone || undefined,
      });

      const req = new NextRequest("http://localhost:3000/api/business", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: unverifiedCookie,
        },
        body: JSON.stringify({
          name: "Illegal Business",
          businessType: "Packaging",
          area: "Dhanmondi",
          city: "Dhaka",
          addressLine: "Road 27",
        }),
      });

      const res = await createBusinessRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Verification");
    });

    it("allows business creation if user has emailVerified = true", async () => {
      const emailUser = await upsertUserByEmail(`verified.${Date.now()}@biznet.com`, "Verified Email User");
      expect(emailUser.emailVerified).toBe(true);

      const emailCookie = await makeSessionCookie({
        userId: emailUser.id,
        email: emailUser.email || undefined,
      });

      const req = new NextRequest("http://localhost:3000/api/business", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: emailCookie,
        },
        body: JSON.stringify({
          name: "Email Verified Corp",
          businessType: "Packaging",
          area: "Banani",
          city: "Dhaka",
          addressLine: "Road 11",
        }),
      });

      const res = await createBusinessRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.business.name).toBe("Email Verified Corp");
    });
  });

  describe("5. Dev Bypass 000000 Guard (§8.1)", () => {
    it("fails 000000 check if NODE_ENV !== 'development'", () => {
      const prevEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = "test";
        const bypassAllowed = isDevTestPhone("+8801700000001");
        expect(bypassAllowed).toBe(false);
      } finally {
        (process.env as any).NODE_ENV = prevEnv;
      }
    });

    it("permits 000000 check ONLY when strictly NODE_ENV === 'development'", () => {
      const prevEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = "development";
        const bypassAllowed = isDevTestPhone("+8801700000001");
        expect(bypassAllowed).toBe(true);
      } finally {
        (process.env as any).NODE_ENV = prevEnv;
      }
    });
  });
});
