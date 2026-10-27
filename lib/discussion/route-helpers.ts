import { NextRequest, NextResponse } from "next/server";
import { PlatformRole } from "@prisma/client";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { checkRateLimit } from "@/lib/ratelimit";
import { DiscussionError, type Viewer } from "@/lib/repo/discussion";

/** Viewer for read endpoints: logged-out visitors read public posts only. */
export async function discussionViewer(req: NextRequest): Promise<Viewer> {
  const { ctx } = await getAuthzContext(req);
  return { userId: ctx?.userId ?? null, isAdmin: ctx?.role === PlatformRole.ADMIN };
}

type AuthzCtx = NonNullable<Awaited<ReturnType<typeof getAuthzContext>>["ctx"]>;

/**
 * Auth + "discussion:post" (verified phone, not banned) + per-user rate limit for write endpoints.
 * Returns either the context or the response to send.
 */
export async function discussionWriter(
  req: NextRequest,
  rate: { key: string; limit: number; windowSeconds: number }
): Promise<{ ok: false; response: NextResponse } | { ok: true; ctx: AuthzCtx }> {
  const { ctx, error, status } = await getAuthzContext(req);
  if (error || !ctx) return { ok: false, response: NextResponse.json({ error: error || "Unauthorized" }, { status: status || 401 }) };
  try {
    assertCan(ctx, "discussion:post");
  } catch (err) {
    if (err instanceof AuthorizationError) return { ok: false, response: NextResponse.json({ error: err.message }, { status: 403 }) };
    throw err;
  }
  const limit = await checkRateLimit(`${rate.key}:${ctx.userId}`, rate.limit, rate.windowSeconds);
  if (!limit.success) return { ok: false, response: NextResponse.json({ error: "Too many posts, please try later" }, { status: 429 }) };
  return { ok: true, ctx };
}

export function discussionError(err: unknown, label: string) {
  if (err instanceof DiscussionError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(`${label}:`, err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
