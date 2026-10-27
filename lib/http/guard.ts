/**
 * lib/http/guard.ts — shared request guards for mutating API routes (§10).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getClientIp } from "@/lib/ip";
import { checkRateLimit } from "@/lib/ratelimit";

/**
 * Per-user (or per-IP when logged out) rate limit for one mutation. Returns the 429 response
 * to send, or null to continue. Default: 60 per hour per route.
 */
export async function limitMutation(req: NextRequest, name: string, limit = 60, windowSeconds = 3600): Promise<NextResponse | null> {
  const session = await getSession(req);
  const who = session.isLoggedIn && session.userId ? `u:${session.userId}` : `ip:${getClientIp(req)}`;
  const result = await checkRateLimit(`mut:${name}:${who}`, limit, windowSeconds);
  if (result.success) return null;
  return NextResponse.json(
    { error: "Too many requests, please try again later" },
    { status: 429, headers: { "retry-after": String(Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000))) } }
  );
}

/** Removes control characters (keeps newlines and tabs) and trims; user text is always rendered as plain text. */
export function sanitizeText(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .trim();
}
