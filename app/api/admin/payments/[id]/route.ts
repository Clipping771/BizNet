import { NextResponse } from "next/server";
import { adminRouteWithParams } from "@/lib/admin/route";
import { reviewPayment } from "@/lib/repo/credits";

/** POST /api/admin/payments/[id] { approve: boolean, note? } — approval adds the credits once (audited). */
export const POST = adminRouteWithParams<{ id: string }>("Review payment error", async (req, ctx, { id }) => {
  const body = await req.json();
  return NextResponse.json(await reviewPayment({ adminUserId: ctx.userId, paymentId: id, approve: body.approve === true, note: body.note ?? null }));
});
