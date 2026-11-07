import { NextRequest, NextResponse } from "next/server";
import { limitMutation } from "@/lib/http/guard";
import { getInstantAnswer } from "@/lib/repo/instant";

/** GET /api/instant?q= — suppliers and real prices for a need typed in plain words (public, no AI). */
export async function GET(req: NextRequest) {
  try {
    const limited = await limitMutation(req, "instant", 600);
    if (limited) return limited;
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ quantity: null, exact: false, categorySlug: null, listings: [], price: null });
    return NextResponse.json(await getInstantAnswer(q));
  } catch (err) {
    console.error("Instant answer error:", err);
    return NextResponse.json({ error: "Failed to answer" }, { status: 500 });
  }
}
