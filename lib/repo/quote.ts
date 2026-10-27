/**
 * lib/repo/quote.ts
 *
 * Repository for quotations and quote-to-order transactions (§8.7, §8.9, F9, F11).
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  QuoteStatus,
  QuoteSource,
  RequestStatus,
  PaymentTerm,
  OrderStatus,
  ContactRevealReason,
  Prisma,
} from "@prisma/client";
import { calculateQuoteTotal } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { logEvent } from "@/lib/events";
import { getSmsProvider } from "@/lib/sms/provider";
import { assertBusinessFileKeys } from "@/lib/storage";
import { sanitizeText } from "@/lib/http/guard";
import { grantFreeTrialIfEligible } from "@/lib/repo/credits";

const MAX_QUOTE_ATTACHMENTS = 3;

export interface SubmitQuoteInput {
  requestId: string;
  supplierBusinessId: string;
  createdByUserId: string;
  unitPrice: number | string | Prisma.Decimal;
  quantity: number | string | Prisma.Decimal;
  deliveryCharge?: number | string | Prisma.Decimal;
  deliveryDays: number;
  paymentTerm: PaymentTerm;
  validUntil: Date | string;
  specMatch?: Record<string, any>;
  notes?: string | null;
  attachmentKeys?: string[];
  source?: QuoteSource;
  opsMinutesSpent?: number;
  idempotencyKey?: string | null;
}

export function generateOrderCode(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `ORD-${datePart}-${randomPart}`;
}

/**
 * Deducts 1 lead credit within an advisory lock transaction (§8.7, D6).
 */
export async function deductLeadCreditWithAdvisoryLock(
  tx: Prisma.TransactionClient,
  businessId: string,
  quoteId: string
): Promise<void> {
  // 1. Acquire transaction-level advisory lock using businessId hash
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lead_credit:' || ${businessId}))`;

  // 2. Compute current balance
  const aggregate = await tx.leadCreditLedger.aggregate({
    where: { businessId },
    _sum: { delta: true },
  });
  const balance = aggregate._sum.delta || 0;

  if (balance < 1) {
    throw new Error("Insufficient lead credits to submit quotation");
  }

  // 3. Deduct 1 credit
  await tx.leadCreditLedger.create({
    data: {
      businessId,
      delta: -1,
      reason: "QUOTE_SUBMISSION",
      refId: quoteId,
    },
  });
}

/**
 * Submits or revises a quotation (§8.7, F9).
 * Maintains exactly one quote row per (request, supplier).
 */
export async function submitQuoteRecord(input: SubmitQuoteInput) {
  // Idempotency (§10): a retried submit with the same key returns the stored quote unchanged
  if (input.idempotencyKey) {
    const previous = await prisma.quote.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (previous) {
      if (previous.supplierBusinessId !== input.supplierBusinessId || previous.requestId !== input.requestId) {
        throw new Error("Idempotency key already used for another quote");
      }
      return previous;
    }
  }
  input = { ...input, notes: input.notes ? sanitizeText(input.notes) : input.notes };
  const request = await prisma.request.findUnique({
    where: { id: input.requestId },
    include: {
      buyerBusiness: {
        include: {
          members: { include: { user: true } },
        },
      },
    },
  });

  if (!request) {
    throw new Error("Request not found");
  }

  // Request MUST be OPEN
  if (request.status !== RequestStatus.OPEN) {
    throw new Error(`Cannot quote: Request is in status ${request.status} (must be OPEN)`);
  }

  // Cannot quote own request (§8.7, D4)
  if (request.buyerBusinessId === input.supplierBusinessId) {
    throw new Error("Cannot quote your own request");
  }

  // Supplier must be BASIC or VERIFIED and not suspended
  const supplier = await prisma.business.findUnique({
    where: { id: input.supplierBusinessId },
  });
  if (!supplier || supplier.isSuspended) {
    throw new Error("Suspended suppliers cannot submit quotes");
  }
  if (supplier.verificationStatus !== "BASIC" && supplier.verificationStatus !== "VERIFIED") {
    throw new Error("Supplier must be BASIC or VERIFIED to submit quotes");
  }

  // A supplier may quote only if invited, or (no direct supplier set) if it serves the category (§4, §8.6)
  const invited = await prisma.requestInvite.findUnique({
    where: {
      requestId_supplierBusinessId: {
        requestId: input.requestId,
        supplierBusinessId: input.supplierBusinessId,
      },
    },
    select: { id: true },
  });
  if (!invited) {
    if (request.directSupplierId && request.directSupplierId !== input.supplierBusinessId) {
      throw new Error("This request is only open to the previous supplier");
    }
    if (!(await supplierServesCategory(input.supplierBusinessId, request.categoryId))) {
      throw new Error("Supplier does not serve this request's category");
    }
  }

  validateQuoteFields(input);
  const specMatch = await normalizeSpecMatch(request.categoryId, input.specMatch);
  const attachmentKeys = assertBusinessFileKeys(
    input.attachmentKeys,
    "quote_attachment",
    input.supplierBusinessId,
    MAX_QUOTE_ATTACHMENTS
  );

  // Check maxQuotesPerRequest (default 10)
  const maxQuotes = (await getSetting("maxQuotesPerRequest")) || 10;
  const currentCount = await prisma.quote.count({
    where: {
      requestId: input.requestId,
      status: { not: QuoteStatus.WITHDRAWN },
      supplierBusinessId: { not: input.supplierBusinessId },
    },
  });
  if (currentCount >= maxQuotes) {
    throw new Error(`Maximum ${maxQuotes} quotes reached for this request`);
  }

  // Compute total price with Decimal arithmetic, round half-up (§8.7, D2)
  const deliveryCharge = input.deliveryCharge ?? 0;
  const totalPrice = calculateQuoteTotal(input.unitPrice, input.quantity, deliveryCharge);

  const validUntilDate =
    typeof input.validUntil === "string" ? new Date(input.validUntil) : input.validUntil;

  // Check if lead credits are enabled (§8.7, D6)
  const leadCreditsEnabled = await getSetting("leadCreditsEnabled");

  // Check existing quote row
  const existingQuote = await prisma.quote.findUnique({
    where: {
      requestId_supplierBusinessId: {
        requestId: input.requestId,
        supplierBusinessId: input.supplierBusinessId,
      },
    },
  });

  let resultQuote: any;

  await prisma.$transaction(async (tx) => {
    if (existingQuote) {
      // Snapshot existing state to QuoteRevision (§8.7, D3)
      await tx.quoteRevision.create({
        data: {
          quoteId: existingQuote.id,
          version: existingQuote.version,
          snapshot: {
            unitPrice: existingQuote.unitPrice.toString(),
            quantity: existingQuote.quantity.toString(),
            deliveryCharge: existingQuote.deliveryCharge.toString(),
            totalPrice: existingQuote.totalPrice.toString(),
            deliveryDays: existingQuote.deliveryDays,
            paymentTerm: existingQuote.paymentTerm,
            validUntil: existingQuote.validUntil.toISOString(),
            specMatch: existingQuote.specMatch,
            notes: existingQuote.notes,
            status: existingQuote.status,
          },
        },
      });

      const nextVersion = existingQuote.version + 1;
      // Re-submitting a withdrawn quote reactivates the same row as SUBMITTED (§8.7)
      const nextStatus =
        existingQuote.status === QuoteStatus.WITHDRAWN ? QuoteStatus.SUBMITTED : QuoteStatus.REVISED;

      resultQuote = await tx.quote.update({
        where: { id: existingQuote.id },
        data: {
          unitPrice: new Prisma.Decimal(input.unitPrice),
          quantity: new Prisma.Decimal(input.quantity),
          deliveryCharge: new Prisma.Decimal(deliveryCharge),
          totalPrice,
          deliveryDays: input.deliveryDays,
          paymentTerm: input.paymentTerm,
          validUntil: validUntilDate,
          specMatch,
          notes: input.notes || null,
          attachmentKeys,
          version: nextVersion,
          status: nextStatus,
          source: input.source || existingQuote.source,
        },
      });
    } else {
      // First quote submission
      const newQuoteId = crypto.randomUUID ? crypto.randomUUID() : `quote_${Date.now()}`;

      // READY monetisation (§8.7): the first quote on a request costs 1 credit when switched on
      if (leadCreditsEnabled) {
        await grantFreeTrialIfEligible(input.supplierBusinessId, tx);
        await deductLeadCreditWithAdvisoryLock(tx, input.supplierBusinessId, newQuoteId);
      }

      resultQuote = await tx.quote.create({
        data: {
          id: newQuoteId,
          requestId: input.requestId,
          supplierBusinessId: input.supplierBusinessId,
          createdByUserId: input.createdByUserId,
          unitPrice: new Prisma.Decimal(input.unitPrice),
          quantity: new Prisma.Decimal(input.quantity),
          deliveryCharge: new Prisma.Decimal(deliveryCharge),
          totalPrice,
          deliveryDays: input.deliveryDays,
          paymentTerm: input.paymentTerm,
          validUntil: validUntilDate,
          specMatch,
          notes: input.notes || null,
          attachmentKeys,
          version: 1,
          status: QuoteStatus.SUBMITTED,
          source: input.source || QuoteSource.SUPPLIER,
          idempotencyKey: input.idempotencyKey || null,
        },
      });
    }

    // If source is CONCIERGE, log OpsTimeLog (§8.7, D5)
    if (input.source === QuoteSource.CONCIERGE && input.opsMinutesSpent) {
      await tx.opsTimeLog.create({
        data: {
          userId: input.createdByUserId,
          activity: "CONCIERGE_QUOTE_CREATE",
          minutes: input.opsMinutesSpent,
          refType: "QUOTE",
          refId: resultQuote.id,
        },
      });
    }
  });

  // Notifications: in-app always, SMS only on first 3 quotes (§8.7, D4)
  const totalQuotesCount = await prisma.quote.count({
    where: { requestId: input.requestId },
  });

  const smsProvider = getSmsProvider();
  for (const member of request.buyerBusiness.members) {
    await prisma.notification.create({
      data: {
        userId: member.userId,
        type: "QUOTE_RECEIVED",
        params: {
          requestId: request.id,
          requestCode: request.code,
          quoteId: resultQuote.id,
          totalPrice: resultQuote.totalPrice.toString(),
        },
        link: `/requests/${request.code}`,
      },
    });

    if (!existingQuote && totalQuotesCount <= 3 && member.user.phone) {
      await smsProvider.sendSms(
        member.user.phone,
        `BizNet: আপনার অনুরোধ "${request.title}"-এর জন্য নতুন কোটেশন এসেছে (মোট ৳${resultQuote.totalPrice})। দেখতে অ্যাপে যান।`
      );
    }
  }

  // AuditLog & Event
  await logAudit({
    actorUserId: input.createdByUserId,
    actorBusinessId: input.supplierBusinessId,
    action: existingQuote ? "QUOTE_REVISED" : "QUOTE_SUBMITTED",
    entityType: "QUOTE",
    entityId: resultQuote.id,
    after: {
      totalPrice: resultQuote.totalPrice.toString(),
      deliveryDays: resultQuote.deliveryDays,
      version: resultQuote.version,
      source: resultQuote.source,
    },
  });

  await logEvent({
    name: existingQuote ? "quote_revised" : "quote_submitted",
    userId: input.createdByUserId,
    businessId: input.supplierBusinessId,
    props: {
      quoteId: resultQuote.id,
      requestId: input.requestId,
      totalPrice: resultQuote.totalPrice.toNumber(),
      source: resultQuote.source,
    },
  });

  return resultQuote;
}

/**
 * Withdraws a quotation (§8.7, D3).
 */
export async function withdrawQuoteRecord(
  quoteId: string,
  supplierBusinessId: string,
  userId: string
) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { request: { select: { status: true } } },
  });

  if (!quote) {
    throw new Error("Quote not found");
  }

  if (quote.supplierBusinessId !== supplierBusinessId) {
    throw new Error("IDOR: Cannot withdraw quote belonging to another business");
  }

  if (quote.status === QuoteStatus.ACCEPTED) {
    throw new Error("Cannot withdraw an already accepted quote");
  }

  if (quote.status === QuoteStatus.WITHDRAWN) {
    throw new Error("Quote is already withdrawn");
  }

  // After the request leaves OPEN the quote is read-only (§8.7)
  if (quote.request.status !== RequestStatus.OPEN) {
    throw new Error(`Cannot withdraw: request is ${quote.request.status}`);
  }

  const updated = await prisma.quote.update({
    where: { id: quoteId },
    data: {
      status: QuoteStatus.WITHDRAWN,
    },
  });

  await logAudit({
    actorUserId: userId,
    actorBusinessId: supplierBusinessId,
    action: "QUOTE_WITHDRAWN",
    entityType: "QUOTE",
    entityId: quoteId,
    before: { status: quote.status },
    after: { status: QuoteStatus.WITHDRAWN },
  });

  await logEvent({
    name: "quote_withdrawn",
    userId,
    businessId: supplierBusinessId,
    props: { quoteId, requestId: quote.requestId },
  });

  return updated;
}

/**
 * Accepts a quote and creates an Order atomically (§8.9, F1-F3).
 * Uses a single DB transaction with atomic check to ensure concurrent accepts produce exactly ONE order.
 */
export async function acceptQuoteAndCreateOrderRecord(
  quoteId: string,
  buyerBusinessId: string,
  userId: string
) {
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch quote with request
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: {
        request: true,
        supplierBusiness: true,
      },
    });

    if (!quote) {
      throw new Error("Quote not found");
    }

    if (quote.request.buyerBusinessId !== buyerBusinessId) {
      throw new Error("IDOR: Cannot accept quote for a request belonging to another business");
    }

    // Idempotent confirm (§10): repeating the same confirmation returns the existing order
    if (quote.status === QuoteStatus.ACCEPTED) {
      const existingOrder = await tx.order.findUnique({ where: { quoteId } });
      if (existingOrder) return existingOrder;
    }

    // 2. Concurrency guard: Ensure request is still in OPEN status!
    // If two accept requests arrive simultaneously, the first transitions the request to AWARDED,
    // and the second transaction will see status !== OPEN and fail cleanly!
    if (quote.request.status !== RequestStatus.OPEN) {
      throw new Error(
        `Cannot accept quote: Request is already ${quote.request.status}. Only one order can be created.`
      );
    }

    if (quote.status !== QuoteStatus.SUBMITTED && quote.status !== QuoteStatus.REVISED) {
      throw new Error(`Cannot accept quote in status ${quote.status}`);
    }

    if (quote.validUntil.getTime() < Date.now()) {
      throw new Error("Cannot accept quote: it has expired");
    }

    // Atomic claim: only one transaction can move the request out of OPEN.
    // A concurrent accept sees count = 0 and fails before creating anything.
    const claimed = await tx.request.updateMany({
      where: { id: quote.requestId, status: RequestStatus.OPEN },
      data: { status: RequestStatus.AWARDED, awardedQuoteId: quoteId },
    });
    if (claimed.count !== 1) {
      throw new Error("Cannot accept quote: Request is no longer OPEN. Only one order can be created.");
    }

    // 3. Mark accepted quote as ACCEPTED
    await tx.quote.update({
      where: { id: quoteId },
      data: { status: QuoteStatus.ACCEPTED },
    });

    // 4. Mark all other live quotes for this request as REJECTED (withdrawn ones stay WITHDRAWN)
    const rejectedQuotes = await tx.quote.findMany({
      where: {
        requestId: quote.requestId,
        id: { not: quoteId },
        status: { in: [QuoteStatus.SUBMITTED, QuoteStatus.REVISED] },
      },
      select: { id: true, supplierBusinessId: true },
    });
    await tx.quote.updateMany({
      where: { id: { in: rejectedQuotes.map((q) => q.id) } },
      data: { status: QuoteStatus.REJECTED },
    });

    // 5. Politely notify suppliers whose quotes were not chosen (§8.9)
    if (rejectedQuotes.length > 0) {
      const rejectedMembers = await tx.membership.findMany({
        where: { businessId: { in: rejectedQuotes.map((q) => q.supplierBusinessId) } },
        select: { userId: true },
      });
      await tx.notification.createMany({
        data: rejectedMembers.map((m) => ({
          userId: m.userId,
          type: "QUOTE_NOT_SELECTED",
          params: { requestId: quote.requestId, requestCode: quote.request.code },
          link: `/requests/${quote.request.code}`,
        })),
      });
    }

    // 6. Create Order snapshot
    const expectedDeliveryAt = new Date();
    expectedDeliveryAt.setDate(expectedDeliveryAt.getDate() + quote.deliveryDays);

    const snapshot = {
      price: quote.unitPrice.toString(),
      deliveryCharge: quote.deliveryCharge.toString(),
      total: quote.totalPrice.toString(),
      quantity: quote.quantity.toString(),
      unit: quote.request.unit,
      deliveryDays: quote.deliveryDays,
      paymentTerm: quote.paymentTerm,
      specDifferences: quote.specMatch,
      notes: quote.notes,
      requestTitle: quote.request.title,
      requestAttributes: quote.request.attributes,
    };

    const orderCode = generateOrderCode();

    const order = await tx.order.create({
      data: {
        code: orderCode,
        requestId: quote.requestId,
        quoteId,
        buyerBusinessId,
        supplierBusinessId: quote.supplierBusinessId,
        snapshot,
        status: OrderStatus.CONFIRMED,
        expectedDeliveryAt,
      },
    });

    // 7. Upsert ContactReveal on (buyer, supplier) with reason = ORDER (§8.9, F2)
    // If a BUYER_REQUESTED_AFTER_QUOTE row already exists, upgrade to ORDER!
    await tx.contactReveal.upsert({
      where: {
        buyerBusinessId_supplierBusinessId: {
          buyerBusinessId,
          supplierBusinessId: quote.supplierBusinessId,
        },
      },
      update: {
        reason: ContactRevealReason.ORDER,
      },
      create: {
        buyerBusinessId,
        supplierBusinessId: quote.supplierBusinessId,
        reason: ContactRevealReason.ORDER,
      },
    });

    // AI comparison outcome (§8.8): ACCEPTED_AS_IS if the buyer ordered the suggested quote, else EDITED
    const comparison = await tx.aiInteraction.findFirst({
      where: { feature: "QUOTE_COMPARISON", input: { path: ["requestId"], equals: quote.requestId } },
      orderBy: { createdAt: "desc" },
      select: { id: true, output: true },
    });
    if (comparison) {
      const suggestedId = (comparison.output as any)?.bestFitForPriority?.quoteId ?? null;
      await tx.aiInteraction.update({
        where: { id: comparison.id },
        data: { outcome: suggestedId === quoteId ? "ACCEPTED_AS_IS" : "EDITED" },
      });
    }

    // 8. Create OrderStatusChange record
    await tx.orderStatusChange.create({
      data: {
        orderId: order.id,
        fromStatus: null,
        toStatus: OrderStatus.CONFIRMED,
        actorUserId: userId,
        actorSide: "BUYER",
        reason: "Order confirmed by buyer",
      },
    });

    // 9. Notify supplier of accepted order
    const supplierMembers = await tx.membership.findMany({
      where: { businessId: quote.supplierBusinessId },
    });
    for (const sm of supplierMembers) {
      await tx.notification.create({
        data: {
          userId: sm.userId,
          type: "ORDER_CONFIRMED",
          params: { orderId: order.id, orderCode: order.code },
          link: `/orders/${order.code}`,
        },
      });
    }

    // 10. AuditLog & Event
    await logAudit({
      actorUserId: userId,
      actorBusinessId: buyerBusinessId,
      action: "ORDER_CONFIRMED",
      entityType: "ORDER",
      entityId: order.id,
      after: { orderCode, quoteId, requestId: quote.requestId },
    });

    await logEvent({
      name: "order_confirmed",
      userId,
      businessId: buyerBusinessId,
      props: { orderId: order.id, orderCode, quoteId },
    });

    return order;
  });
}

function toDecimal(value: unknown, field: string): Prisma.Decimal {
  try {
    const d = new Prisma.Decimal(value as Prisma.Decimal.Value);
    if (!d.isFinite()) throw new Error();
    return d;
  } catch {
    throw new Error(`Invalid ${field}`);
  }
}

/** Server-side checks for quote numbers and terms (§8.7). */
function validateQuoteFields(input: SubmitQuoteInput) {
  if (toDecimal(input.unitPrice, "unit price").lte(0)) throw new Error("Unit price must be greater than zero");
  if (toDecimal(input.quantity, "quantity").lte(0)) throw new Error("Quantity must be greater than zero");
  if (toDecimal(input.deliveryCharge ?? 0, "delivery charge").lt(0)) {
    throw new Error("Delivery charge cannot be negative");
  }
  if (!Number.isInteger(input.deliveryDays) || input.deliveryDays < 0 || input.deliveryDays > 365) {
    throw new Error("Delivery days must be a whole number between 0 and 365");
  }
  if (!Object.values(PaymentTerm).includes(input.paymentTerm)) {
    throw new Error("Invalid payment term");
  }
  const validUntil = new Date(input.validUntil);
  if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() < Date.now()) {
    throw new Error("Valid-until must be a future date");
  }
  if (input.notes && input.notes.length > 2000) {
    throw new Error("Notes must be at most 2000 characters");
  }
}

const SPEC_MATCH_VALUES = ["MATCH", "DIFFERENT", "NOT_STATED"];

/**
 * Spec match per comparable attribute (§8.7): { [field]: MATCH | DIFFERENT | NOT_STATED },
 * plus `_offered: { [field]: value }` for fields marked DIFFERENT. Unknown fields are
 * rejected; comparable fields the supplier skipped become NOT_STATED.
 */
async function normalizeSpecMatch(categoryId: string, raw: unknown): Promise<Prisma.InputJsonObject> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { attributeSchema: true },
  });
  const fields: Array<{ key: string; comparable?: boolean }> =
    ((category?.attributeSchema as any)?.fields as any[]) || [];
  const comparable = fields.filter((f) => f.comparable).map((f) => f.key);

  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const offeredIn = (input._offered && typeof input._offered === "object" ? input._offered : {}) as Record<
    string,
    unknown
  >;
  const result: Record<string, string> = {};
  const offered: Record<string, string> = {};

  for (const key of Object.keys(input)) {
    if (key === "_offered") continue;
    if (!comparable.includes(key)) throw new Error(`Unknown spec field: ${key}`);
    if (!SPEC_MATCH_VALUES.includes(input[key])) throw new Error(`Invalid spec match value for ${key}`);
  }
  for (const key of comparable) {
    const status = input[key] || "NOT_STATED";
    result[key] = status;
    if (status === "DIFFERENT") {
      const value = offeredIn[key];
      if (value === undefined || value === null || String(value).trim() === "") {
        throw new Error(`Enter the offered value for ${key}`);
      }
      offered[key] = String(value).trim().slice(0, 100);
    }
  }
  return Object.keys(offered).length > 0 ? { ...result, _offered: offered } : result;
}

/** True if the supplier has an active listing in the category or declared it. */
export async function supplierServesCategory(supplierBusinessId: string, categoryId: string): Promise<boolean> {
  const business = await prisma.business.findFirst({
    where: {
      id: supplierBusinessId,
      OR: [
        { listings: { some: { categoryId, isActive: true, deletedAt: null } } },
        { supplierCategories: { some: { categoryId } } },
      ],
    },
    select: { id: true },
  });
  return !!business;
}

/** The quote carrying this attachment key, with the two businesses allowed to see it. */
export async function findQuoteByAttachmentKey(key: string) {
  return prisma.quote.findFirst({
    where: { attachmentKeys: { has: key } },
    select: { id: true, supplierBusinessId: true, request: { select: { buyerBusinessId: true } } },
  });
}

export async function getQuoteById(id: string) {
  return prisma.quote.findUnique({
    where: { id },
  });
}

export async function getQuoteWithRequest(id: string) {
  return prisma.quote.findUnique({
    where: { id },
    include: { request: true },
  });
}

export async function listQuotesForRequest(requestId: string, supplierBusinessId?: string) {
  if (supplierBusinessId) {
    return prisma.quote.findMany({
      where: {
        requestId,
        supplierBusinessId,
      },
      include: {
        supplierBusiness: {
          select: { id: true, name: true, area: true, verificationStatus: true },
        },
      },
    });
  }

  return prisma.quote.findMany({
    where: { requestId },
    include: {
      supplierBusiness: {
        select: { id: true, name: true, area: true, verificationStatus: true },
      },
      revisions: {
        orderBy: { version: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
