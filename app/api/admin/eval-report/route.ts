import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { storeEvalReport } from "@/lib/repo/admin";
import { getSetting } from "@/lib/settings";
import { adminRoute } from "@/lib/admin/route";

function tokenMatches(header: string | null): boolean {
  const expected = process.env.EVAL_REPORT_TOKEN;
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(expected);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

/**
 * POST /api/admin/eval-report — the nightly real-provider eval workflow posts its summary
 * with `Authorization: Bearer $EVAL_REPORT_TOKEN` (no user session, §12).
 */
export async function POST(req: NextRequest) {
  if (!tokenMatches(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const n = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 1 ? v : null);
  if (!body || n(body.categoryAccuracy) === null || n(body.fieldAccuracy) === null || !Number.isInteger(body.cases)) {
    return NextResponse.json({ error: "Expected { provider, categoryAccuracy, fieldAccuracy, cases }" }, { status: 400 });
  }
  const stored = await storeEvalReport({
    provider: String(body.provider ?? "unknown").slice(0, 40),
    categoryAccuracy: body.categoryAccuracy,
    fieldAccuracy: body.fieldAccuracy,
    uncertainFlaggedPct: n(body.uncertainFlaggedPct) ?? undefined,
    cases: body.cases,
    runUrl: typeof body.runUrl === "string" ? body.runUrl.slice(0, 300) : null,
  });
  return NextResponse.json(stored, { status: 201 });
}

/** GET /api/admin/eval-report — latest report for the admin view. */
export const GET = adminRoute("Eval report error", async () => {
  return NextResponse.json({
    report: await getSetting("latestEvalReport"),
    thresholds: { category: await getSetting("evalMinCategoryAccuracy"), field: await getSetting("evalMinFieldAccuracy") },
  });
});
