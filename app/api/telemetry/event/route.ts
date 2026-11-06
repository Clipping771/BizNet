import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { logEvent } from "@/lib/events";

const ALLOWED_CLIENT_EVENTS = new Set([
  "listing_view",
  "listing_click",
  "category_browse",
  "dismiss_recommendation",
]);

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const body = await req.json().catch(() => ({}));
    const { name, props } = body;

    if (!name || typeof name !== "string" || !ALLOWED_CLIENT_EVENTS.has(name)) {
      return NextResponse.json({ error: "Invalid event name" }, { status: 400 });
    }

    await logEvent({
      name,
      userId: session.userId ?? null,
      businessId: session.activeBusinessId ?? null,
      props: typeof props === "object" && props !== null ? props : {},
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to record event" }, { status: 500 });
  }
}
