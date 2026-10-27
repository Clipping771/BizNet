import { adminRoute, csvResponse, parseRange } from "@/lib/admin/route";
import { computeMetrics, metricsToCsv } from "@/lib/repo/metrics";

/** GET /api/admin/metrics/export?from&to — the dashboard as CSV. */
export const GET = adminRoute("Metrics export error", async (req) => {
  const { from, to } = parseRange(req);
  const metrics = await computeMetrics(from, to);
  return csvResponse(metricsToCsv(metrics), `biznet-metrics-${metrics.range.from.slice(0, 10)}.csv`);
});
