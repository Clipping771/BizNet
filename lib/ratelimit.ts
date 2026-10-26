import { atomicCheckAndIncrementRateLimit } from "./repo/ratelimit";

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Checks and increments a rate limit bucket atomically in PostgreSQL.
 * Race-safe under concurrent requests.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  return atomicCheckAndIncrementRateLimit(key, limit, windowSeconds);
}
