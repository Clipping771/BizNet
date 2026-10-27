import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { submitQuoteRecord, listQuotesForRequest } from "@/lib/repo/quote";
import { findRequestById } from "@/lib/repo/request";
import { limitMutation } from "@/lib/http/guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limited = await limitMutation(req, "quote-submit", 60);
    if (limited) return limited;
    const { id } = await params;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    if (!ctx.activeBusinessId) {
      return NextResponse.json({ error: "Active business required" }, { status: 403 });
    }

    const request = await findRequestById(id);
    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Verify supplier business permissions
    assertCan(ctx, "quote:create", { supplierBusinessId: ctx.activeBusinessId });

    const body = await req.json();
    const {
      unitPrice,
      quantity,
      deliveryCharge,
      deliveryDays,
      paymentTerm,
      validUntil,
      specMatch,
      notes,
      attachmentKeys,
      idempotencyKey,
    } = body;

    if (!unitPrice || !quantity || deliveryDays === undefined || !paymentTerm || !validUntil) {
      return NextResponse.json({ error: "Missing required quote fields" }, { status: 400 });
    }

    const quote = await submitQuoteRecord({
      requestId: id,
      supplierBusinessId: ctx.activeBusinessId,
      createdByUserId: user.id,
      unitPrice,
      quantity,
      deliveryCharge: deliveryCharge ?? 0,
      deliveryDays: Number(deliveryDays),
      paymentTerm,
      validUntil,
      specMatch: specMatch || {},
      notes,
      attachmentKeys: attachmentKeys || [],
      idempotencyKey,
    });

    return NextResponse.json(quote, { status: 201 });
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.startsWith("Insufficient lead credits")) {
      return NextResponse.json({ error: err.message, code: "INSUFFICIENT_CREDITS" }, { status: 402 });
    }
    console.error("Submit quote error:", err);
    return NextResponse.json({ error: err.message || "Failed to submit quote" }, { status: 400 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    const request = await findRequestById(id);
    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const isBuyer = ctx.activeBusinessId === request.buyerBusinessId;
    const isAdmin = ctx.role === "ADMIN";

    if (!isBuyer && !isAdmin) {
      // If supplier, only see their own quote
      const supplierQuotes = await listQuotesForRequest(id, ctx.activeBusinessId || undefined);
      return NextResponse.json(supplierQuotes);
    }

    const allQuotes = await listQuotesForRequest(id);

    return NextResponse.json(allQuotes);
  } catch (err: any) {
    console.error("List quotes error:", err);
    return NextResponse.json({ error: "Failed to list quotes" }, { status: 500 });
  }
}
