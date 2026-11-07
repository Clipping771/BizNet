import { NextResponse } from "next/server";
import { listSearchAreas } from "@/lib/repo/search";

/** GET /api/search/areas — public read, like search itself: the areas public suppliers are based in. */
export async function GET() {
  try {
    return NextResponse.json({ areas: await listSearchAreas() });
  } catch (err) {
    console.error("Search areas error:", err);
    return NextResponse.json({ error: "Could not load areas" }, { status: 500 });
  }
}
