import { adminRoute, AdminError, csvResponse, parseRange } from "@/lib/admin/route";
import { EXPORT_ENTITIES, exportCsv, type ExportEntity } from "@/lib/repo/admin";
import { logAudit } from "@/lib/audit";

/** GET /api/admin/export?entity=requests|quotes|orders|feedback|businesses|opsTime&from&to — CSV (audited). */
export const GET = adminRoute("Export error", async (req, ctx) => {
  const entity = req.nextUrl.searchParams.get("entity") as ExportEntity;
  if (!EXPORT_ENTITIES.includes(entity)) throw new AdminError("Unknown export");
  const { from, to } = parseRange(req);
  const csv = await exportCsv(entity, from, to);
  await logAudit({ actorUserId: ctx.userId, action: "DATA_EXPORTED", entityType: "EXPORT", entityId: entity, after: { from: from.toISOString(), to: to.toISOString() } });
  return csvResponse(csv, `biznet-${entity}-${from.toISOString().slice(0, 10)}.csv`);
});
