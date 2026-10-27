/**
 * lib/repo/messaging.ts
 *
 * Repository for conversations, messages and contact reveal rules (§8.12, F14, F15, I1-I5).
 */

import { prisma } from "@/lib/prisma";
import { ContactRevealReason } from "@prisma/client";
import { detectContactBypass } from "@/lib/contact/detect";
import { logEvent } from "@/lib/events";
import { checkRateLimit } from "@/lib/ratelimit";
import { assertBusinessFileKeys } from "@/lib/storage";
import { sanitizeText } from "@/lib/http/guard";
import { logAudit } from "@/lib/audit";

const MAX_MESSAGE_ATTACHMENTS = 3;
const MAX_MESSAGE_LENGTH = 2000;

export interface SendMessageInput {
  conversationId: string;
  senderUserId: string;
  senderBusinessId: string;
  body: string;
  attachmentKeys?: string[];
  lang?: string;
}

export interface SendMessageResult {
  blocked: boolean;
  message?: any;
  error?: string;
  pattern?: string;
}

/**
 * A conversation exists only between a request's buyer and a supplier that was
 * invited to it or has quoted on it (§8.12).
 */
export async function supplierIsRequestParticipant(
  requestId: string,
  supplierBusinessId: string
): Promise<boolean> {
  const [invite, quote] = await Promise.all([
    prisma.requestInvite.findUnique({
      where: { requestId_supplierBusinessId: { requestId, supplierBusinessId } },
      select: { id: true },
    }),
    prisma.quote.findUnique({
      where: { requestId_supplierBusinessId: { requestId, supplierBusinessId } },
      select: { id: true },
    }),
  ]);
  return !!invite || !!quote;
}

export async function getOrCreateConversationRecord(
  requestId: string,
  buyerBusinessId: string,
  supplierBusinessId: string
) {
  if (supplierBusinessId === buyerBusinessId) {
    throw new Error("A business cannot message itself");
  }
  if (!(await supplierIsRequestParticipant(requestId, supplierBusinessId))) {
    throw new Error("Supplier is not invited to this request and has not quoted");
  }
  return prisma.conversation.upsert({
    where: {
      requestId_supplierBusinessId: {
        requestId,
        supplierBusinessId,
      },
    },
    update: {},
    create: {
      requestId,
      buyerBusinessId,
      supplierBusinessId,
    },
    include: {
      request: { select: { id: true, code: true, title: true, status: true } },
      buyerBusiness: { select: { id: true, name: true, area: true } },
      supplierBusiness: { select: { id: true, name: true, area: true } },
    },
  });
}

/**
 * Sends a message with contact bypass detection and rate limiting (§8.12, I2, I3, I5).
 */
export async function sendMessageRecord(input: SendMessageInput): Promise<SendMessageResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    include: {
      request: true,
    },
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Verify sender belongs to either buyer or supplier
  if (
    conversation.buyerBusinessId !== input.senderBusinessId &&
    conversation.supplierBusinessId !== input.senderBusinessId
  ) {
    throw new Error("IDOR: Sender does not belong to this conversation");
  }

  const body = sanitizeText(input.body);
  if (!body) {
    throw new Error("Message body is required");
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message must be at most ${MAX_MESSAGE_LENGTH} characters`);
  }
  const attachmentKeys = assertBusinessFileKeys(
    input.attachmentKeys,
    "message_attachment",
    input.senderBusinessId,
    MAX_MESSAGE_ATTACHMENTS
  );

  // Rate limit: 60 messages per hour per user (§8.12, I5)
  const rateLimitKey = `msg:${input.senderUserId}`;
  const rateLimit = await checkRateLimit(rateLimitKey, 60, 3600);
  if (!rateLimit.success) {
    throw new Error("Rate limit exceeded: Maximum 60 messages per hour");
  }

  // Check if ContactReveal already exists
  const reveal = await prisma.contactReveal.findUnique({
    where: {
      buyerBusinessId_supplierBusinessId: {
        buyerBusinessId: conversation.buyerBusinessId,
        supplierBusinessId: conversation.supplierBusinessId,
      },
    },
  });

  // If no contact reveal exists, filter for contact bypass (§8.12, I2, I3)
  if (!reveal) {
    const bypassCheck = detectContactBypass(input.body);
    if (bypassCheck.hasContact) {
      // Soft block: message is NOT saved
      await logEvent({
        name: "contact_blocked",
        userId: input.senderUserId,
        businessId: input.senderBusinessId,
        props: {
          conversationId: input.conversationId,
          pattern: bypassCheck.pattern,
          reason: bypassCheck.reason,
        },
      });

      return {
        blocked: true,
        pattern: bypassCheck.pattern,
        error: "Contact details are shared after you choose a quote",
      };
    }
  }

  // Create message
  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        conversationId: input.conversationId,
        senderUserId: input.senderUserId,
        senderBusinessId: input.senderBusinessId,
        body,
        attachmentKeys,
        lang: input.lang || "bn",
      },
      include: {
        sender: { select: { id: true, name: true } },
        senderBusiness: { select: { id: true, name: true } },
      },
    });

    await tx.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: now },
    });

    return msg;
  });

  return {
    blocked: false,
    message,
  };
}

/**
 * Buyer reveals contact to supplier after receiving quote (§8.12, I4).
 */
export async function revealContactRecord(
  buyerBusinessId: string,
  supplierBusinessId: string,
  userId: string
) {
  // "Show contact" is available only on a received quote (§8.12)
  const receivedQuote = await prisma.quote.findFirst({
    where: {
      supplierBusinessId,
      request: { buyerBusinessId },
      status: { not: "WITHDRAWN" },
    },
    select: { id: true },
  });
  if (!receivedQuote) {
    throw new Error("Contact can be shown only after this supplier has sent you a quote");
  }

  const existing = await prisma.contactReveal.findUnique({
    where: {
      buyerBusinessId_supplierBusinessId: {
        buyerBusinessId,
        supplierBusinessId,
      },
    },
  });

  // If existing has reason ORDER, preserve ORDER upgrade
  const reason =
    existing?.reason === ContactRevealReason.ORDER
      ? ContactRevealReason.ORDER
      : ContactRevealReason.BUYER_REQUESTED_AFTER_QUOTE;

  const reveal = await prisma.contactReveal.upsert({
    where: {
      buyerBusinessId_supplierBusinessId: {
        buyerBusinessId,
        supplierBusinessId,
      },
    },
    update: { reason },
    create: {
      buyerBusinessId,
      supplierBusinessId,
      reason,
    },
  });

  await logAudit({
    actorUserId: userId,
    actorBusinessId: buyerBusinessId,
    action: "CONTACT_REVEALED",
    entityType: "CONTACT_REVEAL",
    entityId: reveal.id,
    before: existing ? { reason: existing.reason } : null,
    after: { reason: reveal.reason, supplierBusinessId },
  });

  await logEvent({
    name: "contact_revealed",
    userId,
    businessId: buyerBusinessId,
    props: { supplierBusinessId, reason },
  });

  return reveal;
}

/**
 * Checks contact visibility according to §8.12 I4:
 * - Buyer sees supplier contact if ANY reveal row exists.
 * - Supplier sees buyer contact ONLY if reason = ORDER.
 */
export async function getContactVisibility(
  buyerBusinessId: string,
  supplierBusinessId: string
): Promise<{ buyerCanSeeSupplier: boolean; supplierCanSeeBuyer: boolean }> {
  const reveal = await prisma.contactReveal.findUnique({
    where: {
      buyerBusinessId_supplierBusinessId: {
        buyerBusinessId,
        supplierBusinessId,
      },
    },
  });

  if (!reveal) {
    return { buyerCanSeeSupplier: false, supplierCanSeeBuyer: false };
  }

  return {
    buyerCanSeeSupplier: true, // Any reveal row gives buyer access to supplier contact
    supplierCanSeeBuyer: reveal.reason === ContactRevealReason.ORDER,
  };
}

export async function getConversationById(id: string) {
  return prisma.conversation.findUnique({
    where: { id },
  });
}

export async function getConversationWithBusinesses(id: string) {
  return prisma.conversation.findUnique({
    where: { id },
    include: {
      buyerBusiness: true,
      supplierBusiness: true,
    },
  });
}

export async function listConversationsForBusiness(businessId: string) {
  return prisma.conversation.findMany({
    where: {
      OR: [
        { buyerBusinessId: businessId },
        { supplierBusinessId: businessId },
      ],
    },
    include: {
      request: { select: { id: true, code: true, title: true, status: true } },
      buyerBusiness: { select: { id: true, name: true, area: true } },
      supplierBusiness: { select: { id: true, name: true, area: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { lastMessageAt: "desc" },
  });
}

/** Marks messages from the other side as read for the viewing business (unread badges). */
export async function markConversationRead(conversationId: string, viewerBusinessId: string) {
  await prisma.message.updateMany({
    where: { conversationId, senderBusinessId: { not: viewerBusinessId }, readAt: null },
    data: { readAt: new Date() },
  });
}

/** The message carrying this attachment key, with its conversation's two businesses. */
export async function findMessageByAttachmentKey(key: string) {
  return prisma.message.findFirst({
    where: { attachmentKeys: { has: key } },
    select: {
      id: true,
      conversation: { select: { buyerBusinessId: true, supplierBusinessId: true } },
    },
  });
}

export async function listMessagesForConversation(conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId },
    include: {
      sender: { select: { id: true, name: true } },
      senderBusiness: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}
