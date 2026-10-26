import { prisma } from "../prisma";
import { RateLimitBucket } from "@prisma/client";

export async function findRateLimitBucket(key: string): Promise<RateLimitBucket | null> {
  return prisma.rateLimitBucket.findUnique({
    where: { key },
  });
}

/**
 * Executes an atomic UPSERT + increment in a single SQL statement in PostgreSQL.
 * Solves the read-then-increment TOCTOU race condition completely.
 */
export async function atomicCheckAndIncrementRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ success: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  const newResetAt = new Date(now.getTime() + windowSeconds * 1000);

  const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${newResetAt})
    ON CONFLICT ("key") DO UPDATE
    SET 
      "count" = CASE 
        WHEN "RateLimitBucket"."resetAt" < NOW() THEN 1 
        ELSE "RateLimitBucket"."count" + 1 
      END,
      "resetAt" = CASE 
        WHEN "RateLimitBucket"."resetAt" < NOW() THEN ${newResetAt} 
        ELSE "RateLimitBucket"."resetAt" 
      END
    RETURNING "count", "resetAt";
  `;

  const row = rows[0];
  const count = Number(row.count);
  const resetAt = new Date(row.resetAt);
  const success = count <= limit;
  const remaining = Math.max(0, limit - count);

  return { success, remaining, resetAt };
}
