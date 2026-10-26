import { NextRequest, NextResponse } from "next/server";
import { verifyOtpHash } from "@/lib/otp";
import { checkRateLimit } from "@/lib/ratelimit";
import { atomicReserveOtpAttempt, atomicConsumeOtp } from "@/lib/repo/otp";
import { upsertUserByEmail, findUserById } from "@/lib/repo/user";
import { getSession } from "@/lib/session";
import { getClientIp } from "@/lib/ip";
import { z } from "zod";

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = verifySchema.safeParse({
      email: typeof body.email === "string" ? body.email.trim() : "",
      code: typeof body.code === "string" ? body.code.trim() : "",
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid email or 6-digit verification code" },
        { status: 400 }
      );
    }

    const { email, code } = parseResult.data;
    const normalizedEmail = email.toLowerCase();
    const ip = getClientIp(req);

    // Rate limits on verification: 500/email/15 min, 500/IP/hour
    const emailLimit = await checkRateLimit(`otp:email:verify:${normalizedEmail}`, 500, 15 * 60);
    if (!emailLimit.success) {
      return NextResponse.json(
        { error: "Too many verification attempts for this email. Please wait 15 minutes." },
        { status: 429 }
      );
    }

    const ipLimit = await checkRateLimit(`otp:email:verify:ip:${ip}`, 500, 60 * 60);
    if (!ipLimit.success) {
      return NextResponse.json(
        { error: "Too many verification attempts from this IP. Please wait 1 hour." },
        { status: 429 }
      );
    }

    const now = new Date();

    // 1. Atomically reserve attempt slot in SQL BEFORE matching hash
    const slot = await atomicReserveOtpAttempt({ email: normalizedEmail }, now);
    if (!slot.success || !slot.id || !slot.codeHash) {
      return NextResponse.json(
        { error: slot.reason || "Invalid or expired verification code" },
        { status: 400 }
      );
    }

    // 2. Compare hash
    const isValid = verifyOtpHash(code, slot.codeHash);
    if (!isValid) {
      const remaining = Math.max(0, 5 - (slot.attempts ?? 5));
      if (remaining === 0) {
        return NextResponse.json(
          { error: "Max attempts exceeded. Please request a new verification code." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          error: `Invalid verification code (${remaining} attempt${
            remaining === 1 ? "" : "s"
          } remaining)`,
        },
        { status: 400 }
      );
    }

    // 3. Mark consumed atomically
    const consumed = await atomicConsumeOtp(slot.id, now);
    if (!consumed) {
      return NextResponse.json(
        { error: "Code could not be verified or has already been used" },
        { status: 400 }
      );
    }

    // 4. Create or update user
    const user = await upsertUserByEmail(normalizedEmail);

    // 5. Establish iron-session
    const fullUser = await findUserById(user.id);
    const primaryMembership = (fullUser as any)?.memberships?.[0];
    const activeBusinessId = user.activeBusinessId || primaryMembership?.businessId;

    const session = await getSession();
    session.userId = user.id;
    session.email = normalizedEmail;
    session.authMethod = "EMAIL";
    session.role = user.role;
    session.activeBusinessId = activeBusinessId;
    session.businessRole = primaryMembership?.role;
    session.isLoggedIn = true;
    await session.save();

    const hasBusiness = !!activeBusinessId;

    return NextResponse.json({
      success: true,
      userId: user.id,
      email: normalizedEmail,
      hasBusiness,
      isNewUser: !hasBusiness,
    });
  } catch (err: any) {
    console.error("Email OTP verify error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred during verification" },
      { status: 500 }
    );
  }
}
