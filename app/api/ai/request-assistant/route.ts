import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { processRequestWithAi } from "@/lib/ai/requestAssistant";
import { limitMutation } from "@/lib/http/guard";

export async function POST(req: NextRequest) {
  try {
    const limited = await limitMutation(req, "ai-assistant", 60);
    if (limited) return limited;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    const body = await req.json();
    const { text, buyerBusinessArea, uiLanguage } = body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    if (text.length > 1000) {
      return NextResponse.json(
        { error: "Text exceeds 1000 character limit" },
        { status: 400 }
      );
    }

    const result = await processRequestWithAi({
      userId: user.id,
      businessId: ctx.activeBusinessId || undefined,
      userText: text.trim(),
      uiLanguage: uiLanguage || user.uiLanguage || "bn",
      buyerBusinessArea,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("AI request assistant error:", err);
    return NextResponse.json(
      {
        success: false,
        fallback: true,
        data: null,
        message: "Internal error processing request",
      },
      { status: 500 }
    );
  }
}
