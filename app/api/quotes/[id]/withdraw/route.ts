import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { withdrawQuoteRecord, getQuoteById } from "@/lib/repo/quote";
import { limitMutation } from "@/lib/http/guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limited = await limitMutation(req, "quote-withdraw", 30);
    if (limited) return limited;
    const { id } = await params;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    if (!ctx.activeBusinessId) {
      return NextResponse.json({ error: "Active business required" }, { status: 403 });
    }

    const quote = await getQuoteById(id);

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    if (quote.supplierBusinessId !== ctx.activeBusinessId && ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "IDOR: Cannot withdraw another business's quote" }, { status: 403 });
    }

    assertCan(ctx, "quote:withdraw", { supplierBusinessId: quote.supplierBusinessId });

    const withdrawn = await withdrawQuoteRecord(id, quote.supplierBusinessId, user.id);
    return NextResponse.json(withdrawn);
  } catch (err: any) {
    console.error("Withdraw quote error:", err);
    return NextResponse.json({ error: err.message || "Failed to withdraw quote" }, { status: 400 });
  }
}
