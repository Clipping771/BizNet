import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { createRequestRecord } from "@/lib/repo/request";
import { logOpsTime } from "@/lib/repo/ops-time";

export async function POST(req: NextRequest) {
  try {
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    assertCan(ctx, "admin:access");

    const body = await req.json();
    const {
      buyerBusinessId,
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
      opsMinutesSpent,
    } = body;

    if (!buyerBusinessId || !categoryId || !title || !quantity || !unit || !deliveryArea) {
      return NextResponse.json({ error: "Missing required request fields" }, { status: 400 });
    }

    const request = await createRequestRecord({
      buyerBusinessId,
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
      createdViaConcierge: true,
    });

    if (opsMinutesSpent && Number(opsMinutesSpent) > 0) {
      await logOpsTime({
        userId: user.id,
        activity: "CONCIERGE_REQUEST_CREATE",
        minutes: Math.round(Number(opsMinutesSpent)),
        refType: "REQUEST",
        refId: request.id,
      });
    }

    return NextResponse.json(request, { status: 201 });
  } catch (err: any) {
    console.error("Concierge create request error:", err);
    return NextResponse.json({ error: err.message || "Failed to create concierge request" }, { status: 400 });
  }
}
