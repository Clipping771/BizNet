/**
 * lib/repo/credits.ts
 *
 * Lead credits and manual bKash / Nagad payments (F23, READY — off until the admin sets
 * `leadCreditsEnabled`). The balance is the sum of LeadCreditLedger deltas; it can never go
 * negative because spending happens under a per-business advisory lock (lib/repo/quote.ts).
 * Approving a payment credits the ledger exactly once (status claimed with updateMany).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";

export class CreditsError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "CreditsError";
  }
}

export const PAYMENT_METHODS = ["BKASH", "NAGAD"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_STATUS = { SUBMITTED: "SUBMITTED", APPROVED: "APPROVED", REJECTED: "REJECTED" } as const;

export async function creditBalance(businessId: string, tx: Prisma.TransactionClient = prisma): Promise<number> {
  const sum = await tx.leadCreditLedger.aggregate({ where: { businessId }, _sum: { delta: true } });
  return sum._sum.delta ?? 0;
}

/**
 * One-time free trial for a supplier that passed verification (BASIC/VERIFIED), granted the
 * first time credits matter. Serialised by the same advisory lock as spending.
 */
export async function grantFreeTrialIfEligible(businessId: string, tx?: Prisma.TransactionClient): Promise<boolean> {
  const run = async (t: Prisma.TransactionClient) => {
    await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lead_credit:' || ${businessId}))`;
    const business = await t.business.findUnique({ where: { id: businessId }, select: { isSupplier: true, verificationStatus: true } });
    if (!business?.isSupplier || (business.verificationStatus !== "BASIC" && business.verificationStatus !== "VERIFIED")) return false;
    const already = await t.leadCreditLedger.findFirst({ where: { businessId, reason: "FREE_TRIAL" }, select: { id: true } });
    if (already) return false;
    const credits = await getSetting("freeTrialCredits");
    if (!credits || credits <= 0) return false;
    await t.leadCreditLedger.create({ data: { businessId, delta: credits, reason: "FREE_TRIAL" } });
    return true;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

export async function creditOverview(businessId: string) {
  const [enabled, packs, receivers] = await Promise.all([
    getSetting("leadCreditsEnabled"),
    getSetting("creditPacks"),
    getSetting("paymentReceivers"),
  ]);
  if (enabled) await grantFreeTrialIfEligible(businessId);
  const [balance, ledger, payments] = await Promise.all([
    creditBalance(businessId),
    prisma.leadCreditLedger.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.paymentSubmission.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return { enabled, balance, packs, receivers, ledger, payments };
}

const BD_MOBILE = /^(?:\+?88)?01[3-9]\d{8}$/;
const TRX_ID = /^[A-Za-z0-9]{6,20}$/;

/** A supplier reports a bKash/Nagad payment for one credit pack; an admin verifies it later. */
export async function submitPayment(input: {
  businessId: string;
  userId: string;
  method: string;
  packIndex: number;
  trxId: string;
  senderNumber: string;
}) {
  if (!(await getSetting("leadCreditsEnabled"))) throw new CreditsError("Lead credits are not active", 403);
  if (!PAYMENT_METHODS.includes(input.method as PaymentMethod)) throw new CreditsError("Choose bKash or Nagad");
  const packs = await getSetting("creditPacks");
  const pack = packs[input.packIndex];
  if (!pack) throw new CreditsError("Choose a credit pack");
  const trxId = String(input.trxId ?? "").trim().toUpperCase();
  if (!TRX_ID.test(trxId)) throw new CreditsError("Enter the transaction ID from the payment SMS");
  const sender = String(input.senderNumber ?? "").replace(/[\s-]/g, "");
  if (!BD_MOBILE.test(sender)) throw new CreditsError("Enter the mobile number you paid from");

  try {
    const payment = await prisma.paymentSubmission.create({
      data: {
        businessId: input.businessId,
        method: input.method,
        amount: new Prisma.Decimal(pack.priceBdt),
        trxId,
        senderNumber: sender,
        creditsRequested: pack.credits,
        status: PAYMENT_STATUS.SUBMITTED,
      },
    });
    await logAudit({ actorUserId: input.userId, actorBusinessId: input.businessId, action: "PAYMENT_SUBMITTED", entityType: "PAYMENT", entityId: payment.id, after: { method: payment.method, amount: pack.priceBdt, credits: pack.credits, trxId } });
    return payment;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new CreditsError("This transaction ID was already submitted", 409);
    }
    throw err;
  }
}

export async function listPendingPayments() {
  return prisma.paymentSubmission.findMany({
    where: { status: PAYMENT_STATUS.SUBMITTED },
    include: { business: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Admin decision; approval adds the pack's credits exactly once (audited). */
export async function reviewPayment(input: { adminUserId: string; paymentId: string; approve: boolean; note?: string | null }) {
  if (!input.paymentId) throw new CreditsError("Payment not found", 404);
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.paymentSubmission.updateMany({
      where: { id: input.paymentId, status: PAYMENT_STATUS.SUBMITTED },
      data: { status: input.approve ? PAYMENT_STATUS.APPROVED : PAYMENT_STATUS.REJECTED, reviewedByUserId: input.adminUserId },
    });
    if (claimed.count !== 1) throw new CreditsError("Payment not found or already reviewed", 409);
    const payment = await tx.paymentSubmission.findUniqueOrThrow({ where: { id: input.paymentId } });
    if (input.approve) {
      await tx.leadCreditLedger.create({
        data: { businessId: payment.businessId, delta: payment.creditsRequested, reason: "PURCHASE", refId: payment.id },
      });
    }
    return payment;
  });
  await logAudit({
    actorUserId: input.adminUserId,
    action: input.approve ? "PAYMENT_APPROVED" : "PAYMENT_REJECTED",
    entityType: "PAYMENT",
    entityId: result.id,
    after: { status: result.status, credits: input.approve ? result.creditsRequested : 0, note: input.note ?? null },
  });
  return result;
}
