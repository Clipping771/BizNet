import { NextResponse } from "next/server";
import { VerificationStatus } from "@prisma/client";
import { adminRouteWithParams, AdminError } from "@/lib/admin/route";
import { setBusinessVerificationStatus, VerificationError } from "@/lib/repo/verification";

/** POST /api/admin/businesses/[id]/status { status, minutes, note? } — suspend / reinstate (audited, ops minutes). */
export const POST = adminRouteWithParams<{ id: string }>("Business status error", async (req, ctx, { id }) => {
  const body = await req.json();
  if (!Object.values(VerificationStatus).includes(body.status)) throw new AdminError("Invalid status");
  try {
    const result = await setBusinessVerificationStatus({
      adminUserId: ctx.userId,
      businessId: id,
      targetStatus: body.status,
      minutesSpent: Number(body.minutes),
      note: body.note ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof VerificationError) throw new AdminError(err.message);
    throw err;
  }
});
