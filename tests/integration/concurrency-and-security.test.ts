import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../lib/prisma";
import { hashOtp } from "../../lib/otp";
import { createOtpRecord } from "../../lib/repo/otp";
import { POST as verifyPhoneOtp } from "../../app/api/auth/otp/verify/route";
import { POST as verifyEmailOtp } from "../../app/api/auth/email/verify/route";
import { POST as sendEmailOtp } from "../../app/api/auth/email/send/route";
import { POST as sendPhoneOtp } from "../../app/api/auth/otp/send/route";
import { POST as createBusinessRoute } from "../../app/api/business/route";
import { getRpConfig } from "../../lib/passkey";
import { getAuthedUser } from "../../lib/auth-user";
import { upsertUserByPhone } from "../../lib/repo/user";
import { getSession } from "../../lib/session";
import { getClientIp } from "../../lib/ip";

describe("Phase 1 Security & Concurrency Verification", () => {
  beforeEach(async () => {
    // Only clear OTP buckets this suite touches; never wipe other suites' buckets
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "otp:" } } });
  });

  describe("5. OTP Real Concurrency: 80 Simultaneous Verify Requests", () => {
    it("Phone OTP: 80 concurrent verify requests where last is correct code -> attempts <= 5 and correct code fails", async () => {
      const testPhone = "+8801999999080";
      const correctCode = "748291";
      const codeHash = hashOtp(correctCode);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      // Clean up previous OTP records
      await prisma.otpCode.deleteMany({ where: { phone: testPhone } });

      // Create fresh OTP record in DB with 0 attempts
      const otp = await createOtpRecord(testPhone, codeHash, expiresAt);
      expect(otp.attempts).toBe(0);

      // Prepare 80 concurrent requests: 79 wrong guesses + 1 correct code at index 79
      const requests = Array.from({ length: 80 }).map((_, idx) => {
        const isLast = idx === 79;
        const code = isLast ? correctCode : `1000${idx.toString().padStart(2, "0")}`;
        return new NextRequest("http://localhost:3000/api/auth/otp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: testPhone, code }),
        });
      });

      // Fire all 80 requests simultaneously using Promise.all
      const responses = await Promise.all(requests.map((req) => verifyPhoneOtp(req)));

      // Check DB record
      const recordInDb = await prisma.otpCode.findUnique({ where: { id: otp.id } });
      expect(recordInDb).toBeDefined();

      // STRICT CONDITION 1: attempts in DB MUST NOT exceed 5
      expect(recordInDb!.attempts).toBeLessThanOrEqual(5);
      expect(recordInDb!.attempts).toBe(5);

      // STRICT CONDITION 2: consumedAt MUST be null (never consumed)
      expect(recordInDb!.consumedAt).toBeNull();

      // STRICT CONDITION 3: The 80th request with the correct code MUST FAIL (cannot login)
      const lastResponse = responses[79];
      expect(lastResponse.ok).toBe(false);
      expect([400, 429]).toContain(lastResponse.status);
      const lastData = await lastResponse.json();
      expect(lastData.error).toBeDefined();
      expect(lastData.success).toBeUndefined();
    });

    it("Email OTP: 80 concurrent verify requests where last is correct code -> attempts <= 5 and correct code fails", async () => {
      const testEmail = "concurrency.test@biznet.com";
      const correctCode = "839201";
      const codeHash = hashOtp(correctCode);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // Clean up previous records
      await prisma.otpCode.deleteMany({ where: { email: testEmail } });

      // Create fresh OTP record in DB with 0 attempts
      const otp = await createOtpRecord({ email: testEmail }, codeHash, expiresAt);
      expect(otp.attempts).toBe(0);

      // Prepare 80 concurrent requests: 79 wrong guesses + 1 correct code at index 79
      const requests = Array.from({ length: 80 }).map((_, idx) => {
        const isLast = idx === 79;
        const code = isLast ? correctCode : `2000${idx.toString().padStart(2, "0")}`;
        return new NextRequest("http://localhost:3000/api/auth/email/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: testEmail, code }),
        });
      });

      // Fire all 80 requests simultaneously using Promise.all
      const responses = await Promise.all(requests.map((req) => verifyEmailOtp(req)));

      // Check DB record
      const recordInDb = await prisma.otpCode.findUnique({ where: { id: otp.id } });
      expect(recordInDb).toBeDefined();

      // STRICT CONDITION 1: attempts in DB MUST NOT exceed 5
      expect(recordInDb!.attempts).toBeLessThanOrEqual(5);
      expect(recordInDb!.attempts).toBe(5);

      // STRICT CONDITION 2: consumedAt MUST be null
      expect(recordInDb!.consumedAt).toBeNull();

      // STRICT CONDITION 3: The 80th request with the correct code MUST FAIL (cannot login)
      const lastResponse = responses[79];
      expect(lastResponse.ok).toBe(false);
      expect([400, 429]).toContain(lastResponse.status);
      const lastData = await lastResponse.json();
      expect(lastData.error).toBeDefined();
      expect(lastData.success).toBeUndefined();
    });
  });

  describe("2. Passkey Security Constraints", () => {
    it("throws critical configuration error in production if RP_ID or APP_URL is missing", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalRp = process.env.RP_ID;
      const originalAppUrl = process.env.APP_URL;

      try {
        (process.env as any).NODE_ENV = "production";
        delete process.env.RP_ID;
        delete process.env.APP_URL;

        expect(() => getRpConfig()).toThrowError(
          /CRITICAL SECURITY CONFIGURATION ERROR/
        );
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
        if (originalRp) process.env.RP_ID = originalRp;
        if (originalAppUrl) process.env.APP_URL = originalAppUrl;
      }
    });

    it("does not take rpID or origin from Host headers", () => {
      const config = getRpConfig();
      expect(config.rpID).toBe(process.env.RP_ID || "localhost");
      expect(config.expectedOrigin).toBe(process.env.APP_URL || "http://localhost:3000");
    });
  });

  describe("3. IP Anti-Spoofing & Multi-Bucket Isolation (TRUST_PROXY=nginx)", () => {
    it("with TRUST_PROXY=nginx, requests from two different real IPs hit separate rate limit buckets, and leftmost spoofed client IP is ignored", async () => {
      const originalTrustProxy = process.env.TRUST_PROXY;
      process.env.TRUST_PROXY = "nginx";
      await prisma.rateLimitBucket.deleteMany({
        where: { OR: [{ key: { contains: "198.51.100.55" } }, { key: { contains: "203.0.113.88" } }] },
      });

      try {
        const realIp1 = "198.51.100.55";
        const realIp2 = "203.0.113.88";
        const spoofedClientIp = "10.0.0.1, 172.16.0.2";

        // Send 10 requests from realIp1 (with varying spoofed client headers)
        for (let i = 1; i <= 10; i++) {
          const req = new NextRequest("http://localhost:3000/api/auth/otp/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-forwarded-for": `${spoofedClientIp}, 192.168.1.${i}, ${realIp1}`,
            },
            body: JSON.stringify({
              phone: `+880172200${i.toString().padStart(4, "0")}`,
            }),
          });
          const res = await sendPhoneOtp(req);
          expect(res.status).toBe(200);
        }

        // 11th request from realIp1 must be rejected with 429
        const req11 = new NextRequest("http://localhost:3000/api/auth/otp/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": `99.99.99.99, ${realIp1}`,
          },
          body: JSON.stringify({
            phone: "+8801722009999",
          }),
        });
        const res11 = await sendPhoneOtp(req11);
        expect(res11.status).toBe(429);
        const data11 = await res11.json();
        expect(data11.error).toContain("Too many OTP requests from this IP");

        // Request from realIp2 must still SUCCEED because realIp2 is in a completely separate bucket!
        const reqIp2 = new NextRequest("http://localhost:3000/api/auth/otp/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": `99.99.99.99, ${realIp2}`,
          },
          body: JSON.stringify({
            phone: "+8801722008888",
          }),
        });
        const resIp2 = await sendPhoneOtp(reqIp2);
        expect(resIp2.status).toBe(200);
      } finally {
        if (originalTrustProxy) process.env.TRUST_PROXY = originalTrustProxy;
      }
    });

    it("production startup guard: throws error if TRUST_PROXY is missing in production", () => {
      const originalTrust = process.env.TRUST_PROXY;
      const originalEnv = process.env.NODE_ENV;
      try {
        delete process.env.TRUST_PROXY;
        (process.env as any).NODE_ENV = "production";

        const req = new NextRequest("http://localhost:3000/api/auth/otp/send");
        expect(() => getClientIp(req)).toThrowError(/CRITICAL SECURITY CONFIGURATION ERROR/);
      } finally {
        if (originalTrust) process.env.TRUST_PROXY = originalTrust;
        (process.env as any).NODE_ENV = originalEnv;
      }
    });
  });

  describe("4. Deleted User Session Invalidation", () => {
    it("getAuthedUser() rejects deleted user with 401 and destroys session", async () => {
      const phone = `+88018${Date.now().toString().slice(-8)}`;
      const user = await upsertUserByPhone(phone, "User To Delete");

      // Soft delete the user
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });

      // Simulate session for this user
      const mockSession: any = {
        userId: user.id,
        isLoggedIn: true,
        destroy: () => {
          mockSession.isLoggedIn = false;
        },
      };

      // Call getAuthedUser helper with session
      const authed = await getAuthedUser(mockSession);
      expect(authed.status).toBe(401);
      expect(authed.user).toBeNull();
      expect(authed.error).toContain("deleted");

      // Clean up
      await prisma.user.delete({ where: { id: user.id } });
    });

    it("POST /api/business returns 401 for deleted user with real sealed session cookie", async () => {
      const phone = `+88018${(Date.now() + 1).toString().slice(-8)}`;
      const user = await upsertUserByPhone(phone, "Deleted Business Creator");

      // Soft delete the user
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });

      // Create genuine sealed iron-session cookie
      const { sealData } = await import("iron-session");
      const { sessionOptions } = await import("../../lib/session");
      const sealed = await sealData(
        { userId: user.id, isLoggedIn: true },
        { password: sessionOptions.password as string }
      );

      const req = new NextRequest("http://localhost:3000/api/business", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `biznet_session=${sealed}`,
        },
        body: JSON.stringify({
          name: "Should Fail Business",
          businessType: "Packaging",
          isBuyer: true,
          area: "Mirpur",
          city: "Dhaka",
        }),
      });

      const res = await createBusinessRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("deleted");

      // Clean up
      await prisma.user.delete({ where: { id: user.id } });
    });
  });

  describe("6. devCode Exposure Guard", () => {
    it("does not expose devCode when NODE_ENV is test or EXPOSE_DEV_OTP is not true", async () => {
      const originalExpose = process.env.EXPOSE_DEV_OTP;
      const originalNodeEnv = process.env.NODE_ENV;

      try {
        process.env.EXPOSE_DEV_OTP = "false";
        (process.env as any).NODE_ENV = "development";

        const req = new NextRequest("http://localhost:3000/api/auth/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: `devcode.test.${Date.now()}@biznet.com` }),
        });

        const res = await sendEmailOtp(req);
        const data = await res.json();
        expect(res.status).toBe(200);
        // devCode MUST NOT be present!
        expect(data.devCode).toBeUndefined();
      } finally {
        if (originalExpose) process.env.EXPOSE_DEV_OTP = originalExpose;
        (process.env as any).NODE_ENV = originalNodeEnv;
      }
    });

    it("exposes devCode ONLY when EXPOSE_DEV_OTP=true AND NODE_ENV=development", async () => {
      const originalExpose = process.env.EXPOSE_DEV_OTP;
      const originalNodeEnv = process.env.NODE_ENV;

      try {
        process.env.EXPOSE_DEV_OTP = "true";
        (process.env as any).NODE_ENV = "development";

        const req = new NextRequest("http://localhost:3000/api/auth/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: `devcode.test2.${Date.now()}@biznet.com` }),
        });

        const res = await sendEmailOtp(req);
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.devCode).toBeDefined();
        expect(data.devCode).toMatch(/^\d{6}$/);
      } finally {
        if (originalExpose) process.env.EXPOSE_DEV_OTP = originalExpose;
        (process.env as any).NODE_ENV = originalNodeEnv;
      }
    });
  });
});
