import { NextRequest } from "next/server";

/**
 * Safely extracts client IP address.
 *
 * Security Architecture:
 * - Next.js 15 does not expose `req.ip` on NextRequest.
 * - In production, TRUST_PROXY must be explicitly configured ('cloudflare' or 'nginx')
 *   to guarantee upstream proxy integrity and prevent rate limit evasion.
 * - When TRUST_PROXY=nginx, the RIGHTMOST IP from `x-forwarded-for` (appended by the proxy)
 *   is evaluated, strictly ignoring client-controlled leftmost spoofed values.
 */
export function getClientIp(req: NextRequest): string {
  const trustProxy = (process.env.TRUST_PROXY || "").trim().toLowerCase();

  // In production, TRUST_PROXY is strictly mandatory
  if (process.env.NODE_ENV === "production" && !trustProxy) {
    throw new Error(
      "CRITICAL SECURITY CONFIGURATION ERROR: TRUST_PROXY environment variable (e.g. 'cloudflare' or 'nginx') must be configured in production to safely evaluate client IP addresses."
    );
  }

  // 1. Cloudflare deployment
  if (trustProxy === "cloudflare") {
    const cfIp = req.headers.get("cf-connecting-ip");
    if (cfIp) {
      return cfIp.trim();
    }
  }

  // 2. Nginx / reverse proxy deployment
  if (trustProxy === "nginx" || trustProxy === "generic") {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 0) {
        return parts[parts.length - 1]; // Rightmost IP appended by immediate trusted upstream
      }
    }
    const realIp = req.headers.get("x-real-ip");
    if (realIp) {
      return realIp.trim();
    }
  }

  // A configured proxy that did not supply its header means the request bypassed
  // the proxy. Never fall back to client-controlled headers: use one shared bucket.
  if (trustProxy) {
    return "unknown-proxy-client";
  }

  // 3. Fallback for non-production development / testing (TRUST_PROXY unset)
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "127.0.0.1";
}
