import { NextRequest, NextResponse } from "next/server";
import { normalizeBdPhone } from "@/lib/phone";
import { generateOtpCode, hashOtp, isDevTestPhone } from "@/lib/otp";
import { checkRateLimit } from "@/lib/ratelimit";
import { getSmsProvider } from "@/lib/sms/provider";
import { createOtpRecord } from "@/lib/repo/otp";

import { getClientIp } from "@/lib/ip";

export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone } = await req.json();
    const phone = normalizeBdPhone(rawPhone);

    if (!phone) {
      return NextResponse.json({ error: "Invalid phone number. Please enter a valid mobile number with country code." }, { status: 400 });
    }

    // Rate limits: 3/phone/15 min, 10/IP/hour
    const ip = getClientIp(req);
    const phoneLimit = await checkRateLimit(`otp:phone:${phone}`, 3, 15 * 60);
    if (!phoneLimit.success) {
      return NextResponse.json(
        { error: "Too many OTP requests for this phone. Please wait 15 minutes." },
        { status: 429 }
      );
    }

    const ipLimit = await checkRateLimit(`otp:ip:${ip}`, 10, 60 * 60);
    if (!ipLimit.success) {
      return NextResponse.json(
        { error: "Too many OTP requests from this IP. Please wait 1 hour." },
        { status: 429 }
      );
    }

    // Generate 6-digit code
    const code = isDevTestPhone(phone) ? "000000" : generateOtpCode();
    const codeHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store in OtpCode model via repository
    await createOtpRecord(phone, codeHash, expiresAt);

    // Send SMS via configured provider with bilingual message
    const sms = getSmsProvider();
    await sms.sendSms(
      phone,
      `আপনার BizNet কোড: ${code}। মেয়াদ ৫ মিনিট। / Your BizNet verification code is ${code}. Valid for 5 minutes.`
    );

    const shouldExposeDevOtp =
      process.env.EXPOSE_DEV_OTP === "true" &&
      process.env.NODE_ENV === "development";
    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
      ...(shouldExposeDevOtp ? { devCode: code } : {}),
    });
  } catch (err: any) {
    console.error("OTP send error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while sending OTP" },
      { status: 500 }
    );
  }
}
