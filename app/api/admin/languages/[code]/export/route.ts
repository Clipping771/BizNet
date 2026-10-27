import { adminRouteWithParams } from "@/lib/admin/route";
import { exportLanguage } from "@/lib/repo/languages";

/** GET — approved translations as a JSON file. */
export const GET = adminRouteWithParams<{ code: string }>("Export language error", async (_req, _ctx, { code }) => {
  const data = await exportLanguage(code);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${code}.json"` },
  });
});
