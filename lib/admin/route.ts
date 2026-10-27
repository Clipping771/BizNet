import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan, AuthorizationError } from "@/lib/authz";

type AuthzCtx = NonNullable<Awaited<ReturnType<typeof getAuthzContext>>["ctx"]>;

/** Error with an HTTP status, thrown by admin handlers for expected failures. */
export class AdminError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "AdminError";
  }
}

async function runAdmin(label: string, req: NextRequest, run: (ctx: AuthzCtx) => Promise<Response>): Promise<Response> {
  try {
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status: status || 401 });
    assertCan(ctx, "admin:access");
    return await run(ctx);
  } catch (err) {
    if (err instanceof AuthorizationError) return NextResponse.json({ error: err.message }, { status: 403 });
    // Repository errors that carry an HTTP status (AdminError, AdminRepoError, LanguageError, …)
    const status = (err as { status?: unknown })?.status;
    if (err instanceof Error && typeof status === "number" && status >= 400 && status < 500) {
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(`${label}:`, err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/**
 * Wraps a static admin route handler: requires a logged-in ADMIN (403 otherwise) and maps
 * errors carrying a 4xx status to that status. Unknown errors become 500 without details.
 */
export function adminRoute(label: string, handler: (req: NextRequest, ctx: AuthzCtx) => Promise<Response>) {
  return (req: NextRequest) => runAdmin(label, req, (ctx) => handler(req, ctx));
}

/** Same as adminRoute for dynamic segments (`[id]`, `[code]`). */
export function adminRouteWithParams<P>(label: string, handler: (req: NextRequest, ctx: AuthzCtx, params: P) => Promise<Response>) {
  return (req: NextRequest, segment: { params: Promise<P> }) =>
    runAdmin(label, req, async (ctx) => handler(req, ctx, await segment.params));
}

/** Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD (to is inclusive); defaults to the last 28 days. */
export function parseRange(req: NextRequest): { from: Date; to: Date } {
  const params = req.nextUrl.searchParams;
  const toParam = params.get("to");
  const fromParam = params.get("from");
  const to = toParam ? new Date(`${toParam}T00:00:00.000+06:00`) : new Date();
  if (toParam) to.setTime(to.getTime() + 86400000); // inclusive end day (Asia/Dhaka)
  const from = fromParam ? new Date(`${fromParam}T00:00:00.000+06:00`) : new Date(to.getTime() - 28 * 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new AdminError("Invalid date range");
  }
  return { from, to };
}

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
