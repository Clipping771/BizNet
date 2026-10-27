import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin/route";
import { listSettings, saveSetting } from "@/lib/repo/admin";

export const GET = adminRoute("List settings error", async () => {
  return NextResponse.json({ settings: await listSettings() });
});

/** PUT /api/admin/settings { key, value } — typed against the default, audited (§9). */
export const PUT = adminRoute("Save setting error", async (req, ctx) => {
  const body = await req.json();
  return NextResponse.json(await saveSetting({ adminUserId: ctx.userId, key: String(body.key ?? ""), value: body.value }));
});
