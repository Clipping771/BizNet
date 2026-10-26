import { prisma } from "../lib/prisma";
import { hashOtp } from "../lib/otp";
import { createOtpRecord } from "../lib/repo/otp";

async function runLiveConcurrencyVerification() {
  const serverUrl = process.env.APP_URL || "http://localhost:3000";
  console.log(`========================================================================`);
  console.log(`STARTING LIVE OTP CONCURRENCY & ATOMIC LOCK VERIFICATION`);
  console.log(`Target Server: ${serverUrl}`);
  console.log(`Invariant: 80 simultaneous requests must hit PostgreSQL atomic lock.`);
  console.log(`Rate limit must NOT intercept requests (Zero 429s).`);
  console.log(`80th request with correct code must fail with HTTP 400 (Lock), NOT 429.`);
  console.log(`========================================================================\n`);

  // Reset rate limit table completely
  await prisma.rateLimitBucket.deleteMany();

  // ==========================================
  // Part 1: Phone OTP Live Concurrency Test
  // ==========================================
  console.log("--- PART 1: Phone OTP Live Concurrency (80 simultaneous requests) ---");
  const phone = "+8801999888777";
  const correctPhoneCode = "654321";
  const phoneHash = hashOtp(correctPhoneCode);
  const phoneExpiry = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.otpCode.deleteMany({ where: { phone } });
  const phoneOtp = await createOtpRecord(phone, phoneHash, phoneExpiry);
  console.log(`Created OTP record in DB: id=${phoneOtp.id}, phone=${phone}, attempts=0\n`);

  // 80 simultaneous requests: index 0..78 wrong code, index 79 correct code
  const phoneRequests = Array.from({ length: 80 }).map((_, idx) => {
    const isLast = idx === 79;
    const code = isLast ? correctPhoneCode : `3000${idx.toString().padStart(2, "0")}`;
    return fetch(`${serverUrl}/api/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      return {
        index: idx + 1,
        code,
        isCorrect: isLast,
        status: res.status,
        error: data.error || null,
        success: data.success || false,
      };
    });
  });

  console.log("Firing 80 concurrent requests to /api/auth/otp/verify via Promise.all...");
  const phoneResults = await Promise.all(phoneRequests);

  console.log("\n--- Full Response Log for all 80 Phone OTP Requests ---");
  phoneResults.forEach((r) => {
    const tag = r.isCorrect ? "[CORRECT CODE - 80th REQ]" : `[Wrong Code #${r.index.toString().padStart(2, "0")}]`;
    console.log(
      `${tag} HTTP Status: ${r.status} | Error: "${r.error || "none"}" | Success: ${r.success}`
    );
  });

  const phoneDbRecord = await prisma.otpCode.findUnique({ where: { id: phoneOtp.id } });
  console.log(`\nPost-Test DB State:`);
  console.log(`- Final DB attempts: ${phoneDbRecord?.attempts} (Expected: exactly 5)`);
  console.log(`- Final DB consumedAt: ${phoneDbRecord?.consumedAt} (Expected: null)`);

  const phone429Count = phoneResults.filter((r) => r.status === 429).length;
  const phone400Count = phoneResults.filter((r) => r.status === 400).length;
  const lastPhoneReq = phoneResults[79];

  console.log(`\nStatus Distribution:`);
  console.log(`- HTTP 400 (Atomic Lock / Validation): ${phone400Count}`);
  console.log(`- HTTP 429 (Rate Limit): ${phone429Count}`);

  if (phone429Count > 0) {
    throw new Error(`FAIL: Rate limit intercepted ${phone429Count} requests! Verify rate limit should not trigger.`);
  }
  if (phoneDbRecord?.attempts !== 5) {
    throw new Error(`FAIL: DB attempts must be exactly 5, got: ${phoneDbRecord?.attempts}`);
  }
  if (phoneDbRecord?.consumedAt !== null) {
    throw new Error(`FAIL: OTP was consumed! It must never be consumed.`);
  }
  if (lastPhoneReq.status !== 400 || !lastPhoneReq.error?.includes("Max attempts exceeded")) {
    throw new Error(
      `FAIL: 80th request with correct code did not fail with atomic lock! status=${lastPhoneReq.status}, error=${lastPhoneReq.error}`
    );
  }
  console.log("✅ PHONE OTP CONCURRENCY PROOF: 80th request failed strictly due to atomic DB lock (HTTP 400 'Max attempts exceeded'), zero 429s!\n");

  // ==========================================
  // Part 2: Email OTP Live Concurrency Test
  // ==========================================
  console.log("--- PART 2: Email OTP Live Concurrency (80 simultaneous requests) ---");
  const email = "live.concurrency@biznet.com";
  const correctEmailCode = "918273";
  const emailHash = hashOtp(correctEmailCode);
  const emailExpiry = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.otpCode.deleteMany({ where: { email } });
  const emailOtp = await createOtpRecord({ email }, emailHash, emailExpiry);
  console.log(`Created Email OTP record in DB: id=${emailOtp.id}, email=${email}, attempts=0\n`);

  const emailRequests = Array.from({ length: 80 }).map((_, idx) => {
    const isLast = idx === 79;
    const code = isLast ? correctEmailCode : `4000${idx.toString().padStart(2, "0")}`;
    return fetch(`${serverUrl}/api/auth/email/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      return {
        index: idx + 1,
        code,
        isCorrect: isLast,
        status: res.status,
        error: data.error || null,
        success: data.success || false,
      };
    });
  });

  console.log("Firing 80 concurrent requests to /api/auth/email/verify via Promise.all...");
  const emailResults = await Promise.all(emailRequests);

  console.log("\n--- Full Response Log for all 80 Email OTP Requests ---");
  emailResults.forEach((r) => {
    const tag = r.isCorrect ? "[CORRECT CODE - 80th REQ]" : `[Wrong Code #${r.index.toString().padStart(2, "0")}]`;
    console.log(
      `${tag} HTTP Status: ${r.status} | Error: "${r.error || "none"}" | Success: ${r.success}`
    );
  });

  const emailDbRecord = await prisma.otpCode.findUnique({ where: { id: emailOtp.id } });
  console.log(`\nPost-Test DB State:`);
  console.log(`- Final DB attempts: ${emailDbRecord?.attempts} (Expected: exactly 5)`);
  console.log(`- Final DB consumedAt: ${emailDbRecord?.consumedAt} (Expected: null)`);

  const email429Count = emailResults.filter((r) => r.status === 429).length;
  const email400Count = emailResults.filter((r) => r.status === 400).length;
  const lastEmailReq = emailResults[79];

  console.log(`\nStatus Distribution:`);
  console.log(`- HTTP 400 (Atomic Lock / Validation): ${email400Count}`);
  console.log(`- HTTP 429 (Rate Limit): ${email429Count}`);

  if (email429Count > 0) {
    throw new Error(`FAIL: Rate limit intercepted ${email429Count} requests!`);
  }
  if (emailDbRecord?.attempts !== 5) {
    throw new Error(`FAIL: DB attempts must be exactly 5, got: ${emailDbRecord?.attempts}`);
  }
  if (emailDbRecord?.consumedAt !== null) {
    throw new Error(`FAIL: OTP was consumed!`);
  }
  if (lastEmailReq.status !== 400 || !lastEmailReq.error?.includes("Max attempts exceeded")) {
    throw new Error(
      `FAIL: 80th request with correct code did not fail with atomic lock! status=${lastEmailReq.status}, error=${lastEmailReq.error}`
    );
  }
  console.log("✅ EMAIL OTP CONCURRENCY PROOF: 80th request failed strictly due to atomic DB lock (HTTP 400 'Max attempts exceeded'), zero 429s!\n");

  console.log("========================================================================");
  console.log("🎉 ALL REAL CONCURRENCY CHECKS CONFIRMED: 0 RATE LIMIT INTERCEPTIONS,");
  console.log("   EXACTLY 5 DB ATTEMPTS, REJECTION STRICTLY CAUSED BY SQL ATOMIC LOCK!");
  console.log("========================================================================");
}

runLiveConcurrencyVerification()
  .catch((err) => {
    console.error("Live concurrency test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
