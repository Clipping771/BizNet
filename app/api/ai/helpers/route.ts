import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { limitMutation } from "@/lib/http/guard";
import { openQuestionForDraft, openRequestForDraft } from "@/lib/repo/ai";
import { findBusinessById } from "@/lib/repo/business";
import { draftAnswer, draftQuoteNote, writeListing } from "@/lib/ai/helpers";

const MAX_TEXT = 1000;

/**
 * POST /api/ai/helpers — { helper: "listing" | "quote" | "answer", ... }
 * Returns a draft for the user to review. 403 while the helper's admin switch is off.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await limitMutation(req, "ai-helper", 30);
    if (limited) return limited;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });

    const body = await req.json().catch(() => ({}));
    const lang = body.lang === "bn" ? "bn" : "en";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length > MAX_TEXT) return NextResponse.json({ error: "Text is too long" }, { status: 400 });

    let result;
    if (body.helper === "listing" || body.helper === "quote") {
      if (!text) return NextResponse.json({ error: "Text is required" }, { status: 400 });
      const business = ctx.activeBusinessId ? await findBusinessById(ctx.activeBusinessId) : null;
      if (!business?.isSupplier || (business.verificationStatus !== "BASIC" && business.verificationStatus !== "VERIFIED")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (body.helper === "listing") {
        const category = typeof body.category === "string" ? body.category.slice(0, 60) : "packaging";
        result = await writeListing({ userId: user.id, businessId: business.id, notes: text, category, lang });
      } else {
        const request = await openRequestForDraft(String(body.requestId ?? ""));
        if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
        result = await draftQuoteNote({ userId: user.id, businessId: business.id, request: `${request.title} (${request.deliveryArea})`, hint: text, lang });
      }
    } else if (body.helper === "answer") {
      const question = await openQuestionForDraft(String(body.questionId ?? ""));
      if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });
      result = await draftAnswer({ userId: user.id, businessId: ctx.activeBusinessId, title: question.title, body: question.body, lang });
    } else {
      return NextResponse.json({ error: "Unknown helper" }, { status: 400 });
    }

    if (!result.ok) {
      const code = result.reason === "DISABLED" ? 403 : result.reason === "BUDGET" ? 429 : 502;
      return NextResponse.json({ error: result.reason }, { status: code });
    }
    return NextResponse.json({ data: result.data, aiInteractionId: result.aiInteractionId });
  } catch (err) {
    console.error("AI helper error:", err);
    return NextResponse.json({ error: "FAILED" }, { status: 500 });
  }
}
