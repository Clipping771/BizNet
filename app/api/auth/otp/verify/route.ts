import { NextRequest, NextResponse } from "next/server";
import { normalizeBdPhone } from "@/lib/phone";
import { verifyOtpHash, isDevTestPhone } from "@/lib/otp";
import { getSession } from "@/lib/session";
import { upsertUserByPhone } from "@/lib/repo/user";
import { listUserBusinesses } from "@/lib/repo/business";
import { findUserMembership } from "@/lib/repo/membership";
import { checkRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/ip";
import {
  atomicReserveOtpAttempt,
  atomicConsumeOtp,
} from "@/lib/repo/otp";

export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone, code } = await req.json();
    const phone = normalizeBdPhone(rawPhone);

    if (!phone || !code) {
      return NextResponse.json({ error: "Phone and OTP code are required" }, { status: 400 });
    }

    const ip = getClientIp(req);

    // Rate limits on verification attempts: 500/phone/15m, 500/IP/hr
    const phoneLimit = await checkRateLimit(`otp:verify:phone:${phone}`, 500, 15 * 60);
    if (!phoneLimit.success) {
      return NextResponse.json(
        { error: "Too many verification attempts for this phone. Please wait 15 minutes." },
        { status: 429 }
      );
    }

    const ipLimit = await checkRateLimit(`otp:verify:ip:${ip}`, 500, 60 * 60);
    if (!ipLimit.success) {
      return NextResponse.json(
        { error: "Too many verification attempts from this IP. Please wait 1 hour." },
        { status: 429 }
      );
    }

    const now = new Date();

    // Check dev bypass (only on designated dev test phones)
    const isDev = isDevTestPhone(phone) && code === "000000";

    if (!isDev) {
      // 1. ATOMICALLY reserve an attempt slot in SQL BEFORE comparing hash.
      // Under high concurrency, only at most 5 attempts can ever pass the WHERE attempts < 5 condition.
      const slot = await atomicReserveOtpAttempt(phone, now);

      if (!slot.success || !slot.id || !slot.codeHash) {
        return NextResponse.json(
          { error: slot.reason || "Invalid or expired OTP code" },
          { status: 400 }
        );
      }

      // 2. Compare hash
      const isValid = verifyOtpHash(code, slot.codeHash);
      if (!isValid) {
        const remaining = Math.max(0, 5 - (slot.attempts ?? 5));
        if (remaining === 0) {
          return NextResponse.json(
            { error: "Max attempts exceeded. Please request a new OTP." },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: `Invalid OTP code (${remaining} attempt${remaining === 1 ? "" : "s"} remaining)` },
          { status: 400 }
        );
      }

      // 3. Mark consumed atomically
      const consumed = await atomicConsumeOtp(slot.id, now);
      if (!consumed) {
        return NextResponse.json(
          { error: "OTP could not be verified or has already been used" },
          { status: 400 }
        );
      }
    }

    const user = await upsertUserByPhone(phone);
    const businesses = await listUserBusinesses(user.id);
    const activeBusiness = businesses[0];
    let activeRole: "OWNER" | "MANAGER" | "STAFF" | undefined = undefined;

    if (activeBusiness) {
      const membership = await findUserMembership(user.id, activeBusiness.id);
      if (membership) {
        activeRole = membership.role;
      }
    }

    const session = await getSession();
    session.userId = user.id;
    session.phone = user.phone || undefined;
    session.role = user.role;
    session.activeBusinessId = activeBusiness?.id || undefined;
    session.businessRole = activeRole;
    session.isLoggedIn = true;
    await session.save();

    return NextResponse.json({
      success: true,
      userId: user.id,
      hasBusiness: businesses.length > 0,
      activeBusinessId: activeBusiness?.id,
      businessRole: activeRole,
    });
  } catch (err: any) {
    console.error("OTP verification error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred during OTP verification" },
      { status: 500 }
    );
  }
}
