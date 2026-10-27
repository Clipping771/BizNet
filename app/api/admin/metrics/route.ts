import { NextResponse } from "next/server";
import { adminRoute, parseRange } from "@/lib/admin/route";
import { computeMetrics } from "@/lib/repo/metrics";

/** GET /api/admin/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD — §13 dashboard numbers with threshold status. */
export const GET = adminRoute("Metrics error", async (req) => {
  const { from, to } = parseRange(req);
  return NextResponse.json(await computeMetrics(from, to));
});
