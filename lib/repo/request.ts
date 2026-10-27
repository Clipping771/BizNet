/**
 * lib/repo/request.ts
 *
 * Repository for procurement requests (§8.5, F7).
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  RequestStatus,
  RequestOutcome,
  QuoteStatus,
  OrderStatus,
  PaymentTerm,
  Priority,
  AiOutcome,
  Prisma,
} from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { logEvent } from "@/lib/events";
import { getSetting } from "@/lib/settings";
import { runMatchRequestJob } from "@/jobs/match-request";
import { buildAttributeZod, type AttributeSchema } from "@/lib/attributes";
import { assertBusinessFileKeys } from "@/lib/storage";

const QUOTE_WINDOW_HOURS = [24, 48, 72, 168];

export interface CreateRequestInput {
  buyerBusinessId: string;
  createdByUserId: string;
  categoryId: string;
  title: string;
  attributes: Record<string, any>;
  quantity: number | Prisma.Decimal;
  unit: string;
  neededBy?: Date | string | null;
  deliveryArea: string;
  preferredPaymentTerm?: PaymentTerm | null;
  priority?: Priority;
  budgetNote?: string | null;
  imageKeys?: string[];
  quoteWindowHours?: number; // 24 | 48 | 72 | 168
  originalNeedText?: string | null;
  aiInteractionId?: string | null;
  aiOutcome?: AiOutcome | null;
  aiEditedFields?: string[];
  directSupplierId?: string | null;
  repeatOfRequestId?: string | null;
  idempotencyKey?: string | null;
  createdViaConcierge?: boolean;
}

export function generateRequestCode(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `REQ-${datePart}-${randomPart}`;
}

export async function createRequestRecord(input: CreateRequestInput) {
  // 1. Verify buyer user phone is verified (§8.5, B2)
  const user = await prisma.user.findUnique({
    where: { id: input.createdByUserId },
    select: { phoneVerified: true, role: true },
  });

  if (!user?.phoneVerified && user?.role !== "ADMIN") {
    throw new Error("Phone verification required to create a request");
  }

  // 2. Validate max open requests per business (§8.5, B2)
  const maxOpenRequests = (await getSetting("maxOpenRequestsPerBusiness")) || 10;
  const openCount = await prisma.request.count({
    where: {
      buyerBusinessId: input.buyerBusinessId,
      status: RequestStatus.OPEN,
    },
  });

  if (openCount >= maxOpenRequests) {
    throw new Error(`Maximum ${maxOpenRequests} open requests allowed per business`);
  }

  // 3. Validation: title 5-120 chars, quantity > 0
  const title = input.title?.trim();
  if (!title || title.length < 5 || title.length > 120) {
    throw new Error("Request title must be between 5 and 120 characters");
  }

  let qty: Prisma.Decimal;
  try {
    qty = new Prisma.Decimal(input.quantity);
  } catch {
    throw new Error("Invalid quantity");
  }
  if (!qty.isFinite() || qty.lte(0)) {
    throw new Error("Quantity must be greater than zero");
  }

  // Category must exist and be active; attributes are validated against its schema (§6, §8.5)
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category || !category.isActive) {
    throw new Error("Category not found");
  }
  let attributes: Record<string, unknown> = {};
  if (category.slug !== "other") {
    const parsed = buildAttributeZod(category.attributeSchema as unknown as AttributeSchema).safeParse(
      input.attributes || {}
    );
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid or missing attributes: ${fields}`);
    }
    attributes = parsed.data;
  }

  if (!input.deliveryArea || !input.deliveryArea.trim()) {
    throw new Error("Delivery area is required");
  }

  const windowChoice = input.quoteWindowHours;
  if (windowChoice !== undefined && !QUOTE_WINDOW_HOURS.includes(windowChoice)) {
    throw new Error("Quote window must be 24, 48, 72 or 168 hours");
  }

  if (input.preferredPaymentTerm && !Object.values(PaymentTerm).includes(input.preferredPaymentTerm)) {
    throw new Error("Invalid payment term");
  }
  if (input.priority && !Object.values(Priority).includes(input.priority)) {
    throw new Error("Invalid priority");
  }
  if (input.budgetNote && input.budgetNote.length > 500) {
    throw new Error("Budget note must be at most 500 characters");
  }

  const imageKeys = assertBusinessFileKeys(input.imageKeys, "request_image", input.buyerBusinessId, 5);

  // directSupplierId is only meaningful for "Only from previous supplier" re-orders:
  // it must be the supplier of a COMPLETED order on the buyer's earlier request (§8.11)
  if (input.directSupplierId) {
    const previousOrder = input.repeatOfRequestId
      ? await prisma.order.findFirst({
          where: {
            requestId: input.repeatOfRequestId,
            buyerBusinessId: input.buyerBusinessId,
            supplierBusinessId: input.directSupplierId,
            status: OrderStatus.COMPLETED,
          },
          select: { id: true },
        })
      : null;
    if (!previousOrder) {
      throw new Error("Direct supplier must be the supplier of a completed order being repeated");
    }
  }
  if (input.repeatOfRequestId) {
    const original = await prisma.request.findUnique({
      where: { id: input.repeatOfRequestId },
      select: { buyerBusinessId: true },
    });
    if (!original || original.buyerBusinessId !== input.buyerBusinessId) {
      throw new Error("Can only repeat your own business's request");
    }
  }

  // 4. Idempotency check
  if (input.idempotencyKey) {
    const existing = await prisma.request.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return existing;
    }
  }

  // 5. Compute closesAt based on quote window (default 48 hours)
  const windowHours = input.quoteWindowHours || (await getSetting("defaultQuoteWindowHours")) || 48;
  const closesAt = new Date(Date.now() + windowHours * 60 * 60 * 1000);

  // 6. NeededBy parsing
  let neededByDate: Date | null = null;
  if (input.neededBy) {
    neededByDate = typeof input.neededBy === "string" ? new Date(input.neededBy) : input.neededBy;
    if (Number.isNaN(neededByDate.getTime())) {
      throw new Error("Invalid needed-by date");
    }
  }

  const code = generateRequestCode();

  // Link only an AI interaction this user created for the request assistant and that no request uses yet
  let safeAiInteractionId = input.aiInteractionId || null;
  if (safeAiInteractionId) {
    const [interaction, existingLinked] = await Promise.all([
      prisma.aiInteraction.findUnique({
        where: { id: safeAiInteractionId },
        select: { userId: true, feature: true },
      }),
      prisma.request.findUnique({
        where: { aiInteractionId: safeAiInteractionId },
        select: { id: true },
      }),
    ]);
    if (
      !interaction ||
      interaction.userId !== input.createdByUserId ||
      interaction.feature !== "REQUEST_ASSISTANT" ||
      existingLinked
    ) {
      safeAiInteractionId = null;
    }
  }

  // 7. Create request record in DB
  const request = await prisma.request.create({
    data: {
      code,
      buyerBusinessId: input.buyerBusinessId,
      createdByUserId: input.createdByUserId,
      categoryId: input.categoryId,
      title,
      attributes: attributes as Prisma.InputJsonValue,
      quantity: qty,
      unit: input.unit || "pcs",
      neededBy: neededByDate,
      deliveryArea: input.deliveryArea.trim(),
      preferredPaymentTerm: input.preferredPaymentTerm || null,
      priority: input.priority || Priority.BALANCED,
      budgetNote: input.budgetNote || null,
      imageKeys,
      status: RequestStatus.OPEN,
      outcome: RequestOutcome.NONE,
      closesAt,
      repeatOfRequestId: input.repeatOfRequestId || null,
      directSupplierId: input.directSupplierId || null,
      originalNeedText: input.originalNeedText || null,
      aiInteractionId: safeAiInteractionId,
      createdViaConcierge: input.createdViaConcierge || false,
      idempotencyKey: input.idempotencyKey || null,
    },
    include: {
      category: true,
      buyerBusiness: true,
    },
  });

  // 8. Update AiInteraction record if provided (§8.4, A5)
  if (safeAiInteractionId) {
    await prisma.aiInteraction.update({
      where: { id: safeAiInteractionId },
      data: {
        outcome: input.aiOutcome || AiOutcome.ACCEPTED_AS_IS,
        editedFields: input.aiEditedFields || [],
      },
    }).catch(() => {});
  }

  // 9. AuditLog & Event
  await logAudit({
    actorUserId: input.createdByUserId,
    actorBusinessId: input.buyerBusinessId,
    action: "REQUEST_CREATED",
    entityType: "REQUEST",
    entityId: request.id,
    after: { code: request.code, title: request.title, closesAt },
  });

  await logEvent({
    name: "request_created",
    userId: input.createdByUserId,
    businessId: input.buyerBusinessId,
    props: {
      requestId: request.id,
      code: request.code,
      categoryId: request.categoryId,
      aiAssisted: !!input.aiInteractionId,
      viaConcierge: !!input.createdViaConcierge,
    },
  });

  // 10. Run matching job synchronously or asynchronously (§8.5, B3)
  try {
    await runMatchRequestJob(request.id);
  } catch (err) {
    console.error("Match request job error:", err);
  }

  return request;
}

export async function cancelRequestRecord(
  requestId: string,
  buyerBusinessId: string,
  userId: string,
  reason: string
) {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new Error("Request not found");
  }

  if (request.buyerBusinessId !== buyerBusinessId) {
    throw new Error("IDOR: Cannot cancel request belonging to another business");
  }

  if (request.status !== RequestStatus.OPEN) {
    throw new Error(`Cannot cancel request in status ${request.status}`);
  }

  if (!reason || !reason.trim()) {
    throw new Error("Cancellation reason is required");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // 1. Reject any submitted/revised quotes
    await tx.quote.updateMany({
      where: {
        requestId,
        status: { in: [QuoteStatus.SUBMITTED, QuoteStatus.REVISED] },
      },
      data: {
        status: QuoteStatus.REJECTED,
      },
    });

    // 2. Update request status to CANCELLED
    return tx.request.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.CANCELLED,
      },
    });
  });

  await logAudit({
    actorUserId: userId,
    actorBusinessId: buyerBusinessId,
    action: "REQUEST_CANCELLED",
    entityType: "REQUEST",
    entityId: requestId,
    before: { status: request.status },
    after: { status: RequestStatus.CANCELLED, reason: reason.trim() },
  });

  await logEvent({
    name: "request_cancelled",
    userId,
    businessId: buyerBusinessId,
    props: { requestId, reason: reason.trim() },
  });

  return updated;
}

export async function findRequestByCode(code: string) {
  return prisma.request.findUnique({
    where: { code },
    include: {
      category: true,
      buyerBusiness: {
        select: {
          id: true,
          name: true,
          slug: true,
          area: true,
          city: true,
          businessType: true,
          verificationStatus: true,
        },
      },
      quotes: {
        include: {
          supplierBusiness: {
            select: {
              id: true,
              name: true,
              slug: true,
              area: true,
              city: true,
              verificationStatus: true,
              verifiedAt: true,
            },
          },
          revisions: {
            orderBy: { version: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      invites: {
        include: {
          supplierBusiness: {
            select: {
              id: true,
              name: true,
              area: true,
              verificationStatus: true,
            },
          },
        },
      },
      order: {
        select: {
          id: true,
          code: true,
          status: true,
        },
      },
    },
  });
}

export type RequestViewerRole = "BUYER" | "SUPPLIER" | "ADMIN";

/**
 * Loads a request (by id or code) for a viewer, enforcing resource-level read rules (§4):
 * - buyer members and admins see everything, including all quotes;
 * - a supplier sees the request only if invited, if it already quoted, or if the
 *   request is OPEN in a category it serves (and not reserved for another supplier),
 *   and then sees only its own quote and invite.
 * Returns null when the request does not exist or the viewer may not read it.
 */
export async function getRequestForViewer(
  idOrCode: string,
  viewer: { businessId: string | null; isAdmin: boolean }
) {
  const request = idOrCode.startsWith("REQ-")
    ? await findRequestByCode(idOrCode)
    : await prisma.request
        .findUnique({ where: { id: idOrCode }, select: { code: true } })
        .then((r) => (r ? findRequestByCode(r.code) : null));
  if (!request) return null;

  if (viewer.isAdmin || (viewer.businessId && viewer.businessId === request.buyerBusinessId)) {
    const viewerRole: RequestViewerRole =
      viewer.businessId === request.buyerBusinessId ? "BUYER" : "ADMIN";
    return { ...request, viewerRole };
  }

  const supplierId = viewer.businessId;
  if (!supplierId) return null;

  const invite = request.invites.find((i) => i.supplierBusinessId === supplierId) || null;
  const ownQuote = request.quotes.find((q) => q.supplierBusinessId === supplierId) || null;

  let canRead = !!invite || !!ownQuote;
  if (!canRead && request.status === RequestStatus.OPEN) {
    const reservedForOther = !!request.directSupplierId && request.directSupplierId !== supplierId;
    if (!reservedForOther) {
      const supplier = await prisma.business.findFirst({
        where: {
          id: supplierId,
          isSupplier: true,
          isSuspended: false,
          verificationStatus: { in: ["BASIC", "VERIFIED"] },
          OR: [
            { listings: { some: { categoryId: request.categoryId, isActive: true, deletedAt: null } } },
            { supplierCategories: { some: { categoryId: request.categoryId } } },
          ],
        },
        select: { id: true },
      });
      canRead = !!supplier;
    }
  }
  if (!canRead) return null;

  if (invite && !invite.viewedAt) {
    await prisma.requestInvite.update({ where: { id: invite.id }, data: { viewedAt: new Date() } });
  }

  // Suppliers never see other suppliers' quotes or invites, the original need text, or the AI link
  const viewerRole: RequestViewerRole = "SUPPLIER";
  return {
    ...request,
    originalNeedText: null,
    aiInteractionId: null,
    quotes: ownQuote ? [ownQuote] : [],
    invites: invite ? [invite] : [],
    order: ownQuote && ownQuote.status === QuoteStatus.ACCEPTED ? request.order : null,
    viewerRole,
  };
}

export async function findRequestById(id: string) {
  return prisma.request.findUnique({
    where: { id },
    include: {
      category: true,
      buyerBusiness: true,
      quotes: true,
    },
  });
}

export async function listRequestsForBuyer(buyerBusinessId: string) {
  return prisma.request.findMany({
    where: { buyerBusinessId },
    include: {
      category: true,
      _count: {
        select: {
          quotes: true,
          invites: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * /requests/inbox (§8.6, C5)
 * Unmatched eligible suppliers can browse OPEN requests in their categories.
 */
export async function listInboxRequestsForSupplier(supplierBusinessId: string) {
  // Find categories the supplier deals in
  const supplier = await prisma.business.findUnique({
    where: { id: supplierBusinessId },
    include: {
      supplierCategories: { select: { categoryId: true } },
      listings: {
        where: { isActive: true, deletedAt: null },
        select: { categoryId: true },
      },
    },
  });

  // Only eligible suppliers browse the inbox (§8.6)
  if (
    !supplier ||
    !supplier.isSupplier ||
    supplier.isSuspended ||
    (supplier.verificationStatus !== "BASIC" && supplier.verificationStatus !== "VERIFIED")
  ) {
    return [];
  }

  const categoryIds = Array.from(
    new Set([
      ...supplier.supplierCategories.map((c) => c.categoryId),
      ...supplier.listings.map((l) => l.categoryId),
    ])
  );

  if (categoryIds.length === 0) return [];

  return prisma.request.findMany({
    where: {
      status: RequestStatus.OPEN,
      buyerBusinessId: { not: supplierBusinessId },
      categoryId: { in: categoryIds },
      closesAt: { gt: new Date() },
      OR: [{ directSupplierId: null }, { directSupplierId: supplierBusinessId }],
    },
    include: {
      category: true,
      buyerBusiness: {
        select: {
          id: true,
          name: true,
          area: true,
          city: true,
          businessType: true,
          verificationStatus: true,
        },
      },
      invites: {
        where: { supplierBusinessId },
        select: { id: true, rank: true, score: true },
      },
      quotes: {
        where: { supplierBusinessId },
        select: { id: true, status: true, totalPrice: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Re-order from a COMPLETED order (§8.11, H, F13).
 * Two choices:
 * - "PREVIOUS_SUPPLIER_ONLY" (directSupplierId set)
 * - "EVERYONE" (open to all eligible suppliers)
 * Event: reorder_started { mode }
 */
export async function createReorderFromOrder(params: {
  orderId: string;
  buyerBusinessId: string;
  userId: string;
  mode: "PREVIOUS_SUPPLIER_ONLY" | "EVERYONE";
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { request: true },
  });

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.buyerBusinessId !== params.buyerBusinessId) {
    throw new Error("IDOR: Cannot re-order from an order belonging to another business");
  }

  if (order.status !== OrderStatus.COMPLETED) {
    throw new Error("Re-orders are only available for COMPLETED orders");
  }

  await logEvent({
    name: "reorder_started",
    userId: params.userId,
    businessId: params.buyerBusinessId,
    props: {
      orderId: order.id,
      mode: params.mode,
      supplierBusinessId: order.supplierBusinessId,
    },
  });

  const directSupplierId =
    params.mode === "PREVIOUS_SUPPLIER_ONLY" ? order.supplierBusinessId : null;

  return createRequestRecord({
    buyerBusinessId: params.buyerBusinessId,
    createdByUserId: params.userId,
    categoryId: order.request.categoryId,
    title: order.request.title,
    attributes: (order.request.attributes as Record<string, any>) || {},
    quantity: order.request.quantity,
    unit: order.request.unit,
    deliveryArea: order.request.deliveryArea,
    preferredPaymentTerm: order.request.preferredPaymentTerm,
    priority: order.request.priority,
    repeatOfRequestId: order.requestId,
    directSupplierId,
  });
}

