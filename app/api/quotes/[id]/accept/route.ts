import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { acceptQuoteAndCreateOrderRecord, getQuoteWithRequest } from "@/lib/repo/quote";
import { limitMutation } from "@/lib/http/guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limited = await limitMutation(req, "quote-accept", 20);
    if (limited) return limited;
    const { id } = await params;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    if (!ctx.activeBusinessId) {
      return NextResponse.json({ error: "Active business required" }, { status: 403 });
    }

    const quote = await getQuoteWithRequest(id);

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    if (quote.request.buyerBusinessId !== ctx.activeBusinessId && ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "IDOR: Cannot accept quote for another business's request" }, { status: 403 });
    }

    assertCan(ctx, "quote:accept", { buyerBusinessId: quote.request.buyerBusinessId });

    const order = await acceptQuoteAndCreateOrderRecord(
      id,
      quote.request.buyerBusinessId,
      user.id
    );

    return NextResponse.json(order, { status: 201 });
  } catch (err: any) {
    console.error("Accept quote error:", err);
    return NextResponse.json({ error: err.message || "Failed to accept quote" }, { status: 400 });
  }
}
