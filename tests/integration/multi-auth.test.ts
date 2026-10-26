import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../lib/prisma";
import { createOtpRecord, atomicReserveOtpAttempt, atomicConsumeOtp } from "../../lib/repo/otp";
import { hashOtp, generateOtpCode } from "../../lib/otp";
import { upsertUserByEmail, findUserByEmail } from "../../lib/repo/user";
import {
  savePasskeyChallenge,
  findAndConsumePasskeyChallenge,
  createPasskey,
  findPasskeyByCredentialId,
} from "../../lib/repo/passkey";

describe("Phase 1: Universal Multi-Method Authentication (Email + Passkey + Phone)", () => {
  const testEmail = `test.trader.${Date.now()}@biznet.global`;

  beforeEach(async () => {
    await prisma.otpCode.deleteMany({ where: { email: testEmail } });
  });

  describe("1. Email + OTP Flow", () => {
    it("creates an email OTP record and atomically reserves verification slots", async () => {
      const code = generateOtpCode();
      const codeHash = hashOtp(code);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const otp = await createOtpRecord({ email: testEmail }, codeHash, expiresAt);
      expect(otp.email).toBe(testEmail);
      expect(otp.phone).toBeNull();
      expect(otp.attempts).toBe(0);

      const now = new Date();
      // First attempt slot reserved
      const slot = await atomicReserveOtpAttempt({ email: testEmail }, now);
      expect(slot.success).toBe(true);
      expect(slot.codeHash).toBe(codeHash);

      // Consume OTP
      const consumed = await atomicConsumeOtp(slot.id!, now);
      expect(consumed).toBe(true);

      // Second consumption must fail
      const secondConsume = await atomicConsumeOtp(slot.id!, now);
      expect(secondConsume).toBe(false);
    });

    it("locks email verification after 5 failed attempts under high concurrency", async () => {
      const code = "987654";
      const codeHash = hashOtp(code);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const otp = await createOtpRecord({ email: testEmail }, codeHash, expiresAt);
      const now = new Date();

      // Fire 10 concurrent verification slots
      const slots = await Promise.all(
        Array.from({ length: 10 }).map(() =>
          atomicReserveOtpAttempt({ email: testEmail }, now)
        )
      );

      const passed = slots.filter((s) => s.success);
      const blocked = slots.filter((s) => !s.success);

      expect(passed.length).toBe(5);
      expect(blocked.length).toBe(5);
      expect(blocked[0].reason).toContain("Max attempts exceeded");
    });

    it("upserts user by email and preserves unique identity", async () => {
      const user = await upsertUserByEmail(testEmail, "Global Trader");
      expect(user.email).toBe(testEmail);
      expect(user.emailVerified).toBe(true);
      expect(user.phone).toBeNull();

      const lookup = await findUserByEmail(testEmail);
      expect(lookup?.id).toBe(user.id);
      expect(lookup?.name).toBe("Global Trader");

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });
  });

  describe("2. Passkey / WebAuthn Challenge & Credential Security", () => {
    it("saves and atomically consumes a passkey challenge (replay attack protection)", async () => {
      const challenge = `chal_${Date.now()}_${Math.random()}`;
      await savePasskeyChallenge(challenge);

      // First consumption succeeds
      const firstResult = await findAndConsumePasskeyChallenge(challenge);
      expect(firstResult.valid).toBe(true);

      // Replay attempt must fail
      const replayResult = await findAndConsumePasskeyChallenge(challenge);
      expect(replayResult.valid).toBe(false);
    });

    it("links passkey credential to user and looks up by credentialId", async () => {
      const user = await upsertUserByEmail(`passkey.user.${Date.now()}@biznet.global`);
      const credentialId = `cred_${Date.now()}`;

      const passkey = await createPasskey({
        userId: user.id,
        credentialId,
        publicKey: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA",
        counter: BigInt(0),
        deviceType: "platform",
        name: "MacBook Touch ID",
      });

      expect(passkey.credentialId).toBe(credentialId);
      expect(passkey.userId).toBe(user.id);

      const lookup = await findPasskeyByCredentialId(credentialId);
      expect(lookup?.id).toBe(passkey.id);
      expect(lookup?.user.id).toBe(user.id);

      // Cleanup
      await prisma.passkey.delete({ where: { id: passkey.id } });
      await prisma.user.delete({ where: { id: user.id } });
    });
  });
});
