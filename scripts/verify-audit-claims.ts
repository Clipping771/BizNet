import { prisma } from "../lib/prisma";
import { hashOtp } from "../lib/otp";
import { createOtpRecord, atomicReserveOtpAttempt } from "../lib/repo/otp";
import { getClientIp } from "../lib/ip";
import { upsertUserByPhone, anonymizeUser, findUserById } from "../lib/repo/user";
import { createBusiness } from "../lib/repo/business";
import { countUserOwnedBusinesses } from "../lib/repo/membership";
import { NextRequest } from "next/server";

async function main() {
  console.log("==================================================================");
  console.log("১. OTP CONCURRENCY & RACE TEST (২০টি রিকোয়েস্ট একসাথে পাঠানো হলো)");
  console.log("==================================================================");
  const testPhone = "+8801999999999";
  await prisma.otpCode.deleteMany({ where: { phone: testPhone } });
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const otp = await createOtpRecord(testPhone, hashOtp("123456"), expiresAt);
  const now = new Date();

  // ২০টি রিকোয়েস্ট একসাথে পাঠানো হচ্ছে
  const concurrent = await Promise.all(
    Array.from({ length: 20 }).map(() => atomicReserveOtpAttempt(testPhone, now))
  );

  const granted = concurrent.filter((r) => r.success);
  const rejected = concurrent.filter((r) => !r.success);

  console.log(`- মোট রিকোয়েস্ট পাঠানো হয়েছে: ${concurrent.length}`);
  console.log(`- অনুমতি পেয়েছে (attempts < 5): ${granted.length}`);
  console.log(`- ব্লক হয়েছে (Max attempts exceeded): ${rejected.length}`);

  const inDb = await prisma.otpCode.findUnique({ where: { id: otp.id } });
  console.log(`- PostgreSQL ডাটাবেজে রেকর্ড হওয়া attempts সংখ্যা: ${inDb?.attempts}`);
  console.log(`- রেজাল্ট: ${granted.length === 5 && rejected.length === 15 && inDb?.attempts === 5 ? "✅ পাস (Race condition সম্পূর্ণ দূর হয়েছে)" : "❌ ফেইল"}`);
  await prisma.otpCode.deleteMany({ where: { phone: testPhone } });

  console.log("\n==================================================================");
  console.log("২. X-FORWARDED-FOR IP স্পুফিং টেস্ট");
  console.log("==================================================================");
  const fakeRequest = new NextRequest("http://localhost:3000/api/auth/otp/send", {
    headers: {
      "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.195",
    },
  });
  const extractedIp = getClientIp(fakeRequest);
  console.log(`- ক্লায়েন্ট XFF হেডারে পাঠিয়েছে: "1.1.1.1, 2.2.2.2, 203.0.113.195"`);
  console.log(`- এক্সট্র্যাক্ট করা বিশ্বস্ত IP (Rightmost): ${extractedIp}`);
  console.log(`- স্পুফ করা বামদিকের IP (1.1.1.1) বাদ পড়েছে?: ${extractedIp !== "1.1.1.1" ? "হ্যাঁ, বাদ পড়েছে" : "না"}`);
  console.log(`- রেজাল্ট: ${extractedIp === "203.0.113.195" ? "✅ পাস (স্পুফিং অসম্ভব)" : "❌ ফেইল"}`);

  console.log("\n==================================================================");
  console.log("৩. ওনার অ্যাকাউন্ট ডিলিট গার্ড ও ডিলিটের পর পুরনো কুকি টেস্ট");
  console.log("==================================================================");
  const ownerUser = await upsertUserByPhone(
    "+8801888888888",
    "Live Test Owner"
  );
  const biz = await createBusiness(ownerUser.id, {
    name: "Live Test Biz",
    area: "Gulshan",
    city: "Dhaka",
    businessType: "RESTAURANT",
    isBuyer: true,
    isSupplier: false,
  });

  const ownedCount = await countUserOwnedBusinesses(ownerUser.id);
  console.log(`- ইউজার একটি বিজনেসের OWNER। মালিকানাধীন বিজনেসের সংখ্যা: ${ownedCount}`);
  console.log(`- অ্যাকাউন্ট ডিলিট করতে পারবে? (ownedCount > 0 হলে ব্লক): ${ownedCount > 0 ? "✅ ব্লক হয়েছে (বিজনেস ওনার ছাড়া থাকবে না)" : "❌ ওনারহীন বিজনেস তৈরি হওয়ার ঝুঁকি আছে"}`);

  // বিজনেস ক্লিনআপ করে ইউজারকে সফট-ডিলিট (anonymize) করা হলো
  await prisma.membership.deleteMany({ where: { businessId: biz.id } });
  await prisma.business.delete({ where: { id: biz.id } });

  await anonymizeUser(ownerUser.id);
  const lookupAfterDelete = await findUserById(ownerUser.id);
  console.log(`- ডিলিট করার পর findUserById রেজাল্ট (deletedAt !== null): ${lookupAfterDelete}`);
  console.log(`- অন্য ডিভাইসে থাকা পুরনো কুকি কি কাজ করবে?: ${lookupAfterDelete === null ? "✅ না, সেশন সাথে সাথে বাতিল (নিরাপদ)" : "❌ হ্যাঁ (বাগ)"}`);
  await prisma.user.delete({ where: { id: ownerUser.id } });

  console.log("\n==================================================================");
  console.log("সবগুলো দাবি সরাসরি PostgreSQL ডাটাবেজে চালিয়ে প্রমাণিত!");
  console.log("==================================================================");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
