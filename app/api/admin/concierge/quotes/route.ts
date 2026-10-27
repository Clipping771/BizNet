import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { submitQuoteRecord } from "@/lib/repo/quote";
import { QuoteSource } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    assertCan(ctx, "admin:access");

    const body = await req.json();
    const {
      requestId,
      supplierBusinessId,
      unitPrice,
      quantity,
      deliveryCharge,
      deliveryDays,
      paymentTerm,
      validUntil,
      specMatch,
      notes,
      opsMinutesSpent,
    } = body;

    if (!requestId || !supplierBusinessId || !unitPrice || !quantity || deliveryDays === undefined) {
      return NextResponse.json({ error: "Missing required quote fields" }, { status: 400 });
    }

    const quote = await submitQuoteRecord({
      requestId,
      supplierBusinessId,
      createdByUserId: user.id,
      unitPrice,
      quantity,
      deliveryCharge: deliveryCharge ?? 0,
      deliveryDays: Number(deliveryDays),
      paymentTerm,
      validUntil: validUntil || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      specMatch: specMatch || {},
      notes,
      source: QuoteSource.CONCIERGE,
      opsMinutesSpent: opsMinutesSpent ? Number(opsMinutesSpent) : 5,
    });

    return NextResponse.json(quote, { status: 201 });
  } catch (err: any) {
    console.error("Concierge create quote error:", err);
    return NextResponse.json({ error: err.message || "Failed to create concierge quote" }, { status: 400 });
  }
}
