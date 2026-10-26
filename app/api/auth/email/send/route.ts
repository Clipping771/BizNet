import { NextRequest, NextResponse } from "next/server";
import { generateOtpCode, hashOtp } from "@/lib/otp";
import { checkRateLimit } from "@/lib/ratelimit";
import { getEmailProvider } from "@/lib/email/provider";
import { createOtpRecord } from "@/lib/repo/otp";
import { getClientIp } from "@/lib/ip";
import { z } from "zod";

const emailSchema = z.string().email();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
    const parseResult = emailSchema.safeParse(rawEmail);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    const email = parseResult.data.toLowerCase();
    const ip = getClientIp(req);

    // Rate limits: 3/email/15 min, 10/IP/hour
    const emailLimit = await checkRateLimit(`otp:email:${email}`, 3, 15 * 60);
    if (!emailLimit.success) {
      return NextResponse.json(
        { error: "Too many login requests for this email. Please wait 15 minutes." },
        { status: 429 }
      );
    }

    const ipLimit = await checkRateLimit(`otp:email:ip:${ip}`, 10, 60 * 60);
    if (!ipLimit.success) {
      return NextResponse.json(
        { error: "Too many login requests from this IP. Please wait 1 hour." },
        { status: 429 }
      );
    }

    // Generate 6-digit code
    const code = generateOtpCode();
    const codeHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store in OtpCode model
    await createOtpRecord({ email }, codeHash, expiresAt);

    // Send email
    const emailProvider = getEmailProvider();
    await emailProvider.sendEmail(
      email,
      "Your BizNet Verification Code",
      `Your verification code is: ${code}. This code is valid for 10 minutes.`,
      `<div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
        <h2 style="color: #047857;">BizNet</h2>
        <p>Use the 6-digit verification code below to complete your login:</p>
        <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; padding: 12px 24px; background: #ecfdf5; color: #065f46; border-radius: 8px; display: inline-block; margin: 16px 0;">
          ${code}
        </div>
        <p style="font-size: 12px; color: #64748b;">This code expires in 10 minutes. If you did not request this, please ignore this email.</p>
      </div>`
    );

    const shouldExposeDevOtp =
      process.env.EXPOSE_DEV_OTP === "true" &&
      process.env.NODE_ENV === "development";
    return NextResponse.json({
      success: true,
      message: "Verification code sent to email",
      ...(shouldExposeDevOtp ? { devCode: code } : {}),
    });
  } catch (err: any) {
    console.error("Email OTP send error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while sending email verification code" },
      { status: 500 }
    );
  }
}
