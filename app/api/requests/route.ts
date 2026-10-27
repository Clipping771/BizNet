import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { createRequestRecord, listRequestsForBuyer } from "@/lib/repo/request";

export async function POST(req: NextRequest) {
  try {
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    if (!ctx.activeBusinessId) {
      return NextResponse.json({ error: "Active business required" }, { status: 403 });
    }

    assertCan(ctx, "request:create", { buyerBusinessId: ctx.activeBusinessId });

    const body = await req.json();
    const {
      categoryId,
      title,
      attributes,
      quantity,
      unit,
      neededBy,
      deliveryArea,
      preferredPaymentTerm,
      priority,
      budgetNote,
      imageKeys,
      quoteWindowHours,
      originalNeedText,
      aiInteractionId,
      aiOutcome,
      aiEditedFields,
      directSupplierId,
      repeatOfRequestId,
      idempotencyKey,
    } = body;

    if (!categoryId || !title || !quantity || !unit || !deliveryArea) {
      return NextResponse.json({ error: "Missing required request fields" }, { status: 400 });
    }

    const request = await createRequestRecord({
      buyerBusinessId: ctx.activeBusinessId,
      createdByUserId: user.id,
      categoryId,
      title,
      attributes: attributes || {},
      quantity,
      unit,
      neededBy,
      deliveryArea,
      preferredPaymentTerm,
      priority,
      budgetNote,
      imageKeys: imageKeys || [],
      quoteWindowHours: quoteWindowHours ? Number(quoteWindowHours) : 48,
      originalNeedText,
      aiInteractionId,
      aiOutcome,
      aiEditedFields,
      directSupplierId,
      repeatOfRequestId,
      idempotencyKey,
    });

    return NextResponse.json(request, { status: 201 });
  } catch (err: any) {
    console.error("Create request error:", err);
    return NextResponse.json({ error: err.message || "Failed to create request" }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    if (!ctx.activeBusinessId) {
      return NextResponse.json({ error: "Active business required" }, { status: 403 });
    }

    const requests = await listRequestsForBuyer(ctx.activeBusinessId);
    return NextResponse.json(requests);
  } catch (err: any) {
    console.error("List requests error:", err);
    return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
  }
}
