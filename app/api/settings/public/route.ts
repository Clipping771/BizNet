import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

/** GET /api/settings/public — the feature switches the UI needs (no secrets). */
export async function GET() {
  const [leadCreditsEnabled, translationEnabled] = await Promise.all([getSetting("leadCreditsEnabled"), getSetting("translationEnabled")]);
  return NextResponse.json({ leadCreditsEnabled, translationEnabled }, { headers: { "cache-control": "no-store" } });
}
