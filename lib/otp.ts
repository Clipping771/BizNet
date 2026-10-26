import * as crypto from "crypto";

export function generateOtpCode(): string {
  // 6 digits cryptographically secure: range [100000, 999999] inclusive
  const randomNum = crypto.randomInt(100000, 1000000);
  return String(randomNum);
}

export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function verifyOtpHash(code: string, hashed: string): boolean {
  const codeHash = hashOtp(code);
  return crypto.timingSafeEqual(Buffer.from(codeHash), Buffer.from(hashed));
}

export function isDevTestPhone(phone: string): boolean {
  // Spec §8.1: Dev test bypass 000000 permitted ONLY when NODE_ENV === "development"
  if (process.env.NODE_ENV !== "development") return false;
  const testPhones = (process.env.DEV_TEST_PHONES || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return testPhones.includes(phone);
}
