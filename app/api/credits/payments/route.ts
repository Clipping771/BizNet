import { NextRequest, NextResponse } from "next/server";
import { MemberRole } from "@prisma/client";
import { getAuthzContext } from "@/lib/auth-user";
import { CreditsError, submitPayment } from "@/lib/repo/credits";
import { limitMutation } from "@/lib/http/guard";

/** POST /api/credits/payments { method, packIndex, trxId, senderNumber } — OWNER/MANAGER of a supplier. */
export async function POST(req: NextRequest) {
  try {
    const limited = await limitMutation(req, "payment-submit", 10);
    if (limited) return limited;
    const { ctx, error, status } = await getAuthzContext(req);
    if (error || !ctx) return NextResponse.json({ error: error || "Unauthorized" }, { status });
    if (!ctx.activeBusinessId || (ctx.businessRole !== MemberRole.OWNER && ctx.businessRole !== MemberRole.MANAGER)) {
      return NextResponse.json({ error: "Only an owner or manager can buy credits" }, { status: 403 });
    }
    const body = await req.json();
    const payment = await submitPayment({
      businessId: ctx.activeBusinessId,
      userId: ctx.userId,
      method: String(body.method ?? ""),
      packIndex: Number(body.packIndex),
      trxId: String(body.trxId ?? ""),
      senderNumber: String(body.senderNumber ?? ""),
    });
    return NextResponse.json(payment, { status: 201 });
  } catch (err) {
    if (err instanceof CreditsError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Payment submit error:", err);
    return NextResponse.json({ error: "Failed to submit payment" }, { status: 500 });
  }
}
