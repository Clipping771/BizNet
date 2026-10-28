import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { markNotificationsRead } from "@/lib/repo/notifications";

/** POST /api/notifications/read { ids?: string[] } — marks the user's notifications read (all when no ids). */
export async function POST(req: NextRequest) {
  try {
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 200) : undefined;
    return NextResponse.json({ marked: await markNotificationsRead(ctx.userId, ids) });
  } catch (err) {
    console.error("Mark notifications error:", err);
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
