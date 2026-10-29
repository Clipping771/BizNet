import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { createRequestRecord, listRequestsForBuyer } from "@/lib/repo/request";
import { createBusiness } from "@/lib/repo/business";
import { getSession } from "@/lib/session";
import { limitMutation } from "@/lib/http/guard";

export async function POST(req: NextRequest) {
  try {
    const limited = await limitMutation(req, "request-create", 20);
    if (limited) return limited;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    let activeBusinessId = ctx.activeBusinessId;
    if (!activeBusinessId) {
      const biz = await createBusiness(user.id, {
        name: user.name || "My Business",
        businessType: "Buyer",
        isBuyer: true,
        isSupplier: false,
        area: "Dhaka",
        city: "Dhaka",
      });
      activeBusinessId = biz.id;
      ctx.activeBusinessId = biz.id;
      ctx.businessRole = "OWNER";
      const session = await getSession();
      session.activeBusinessId = biz.id;
      session.businessRole = "OWNER";
      await session.save();
    }

    assertCan(ctx, "request:create", { buyerBusinessId: activeBusinessId });

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
      buyerBusinessId: activeBusinessId!,
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
