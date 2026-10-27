import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { rateAiInteractionRecord } from "@/lib/repo/ai";
import { limitMutation } from "@/lib/http/guard";

export async function POST(req: NextRequest) {
  try {
    const limited = await limitMutation(req, "ai-rate", 120);
    if (limited) return limited;
    const { user, error, status } = await getAuthzContext(req);
    if (error || !user) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    const body = await req.json();
    const { interactionId, rating } = body;

    if (!interactionId || typeof interactionId !== "string" || typeof rating !== "number") {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const updated = await rateAiInteractionRecord(interactionId, user.id, rating);
    if (!updated) {
      return NextResponse.json({ error: "AI interaction not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Rate AI interaction error:", err);
    return NextResponse.json({ error: "Failed to update rating" }, { status: 500 });
  }
}
