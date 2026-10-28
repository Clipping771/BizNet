import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { listNotifications, unreadNotificationCount } from "@/lib/repo/notifications";

/** GET /api/notifications[?count=1] — the user's notifications (or just the unread count). */
export async function GET(req: NextRequest) {
  try {
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });
    const unread = await unreadNotificationCount(ctx.userId);
    if (req.nextUrl.searchParams.get("count")) return NextResponse.json({ unread });
    return NextResponse.json({ unread, notifications: await listNotifications(ctx.userId) });
  } catch (err) {
    console.error("Notifications error:", err);
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}
