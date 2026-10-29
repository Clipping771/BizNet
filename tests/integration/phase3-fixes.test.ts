/**
 * tests/integration/phase3-fixes.test.ts
 *
 * Regression tests for the independent Phase 3 review:
 * - quote / message attachments live in the private bucket and only the two parties can open them;
 * - quote eligibility (invited or serving the category; direct-supplier re-orders);
 * - quote lifecycle rules (withdraw only while OPEN, re-submit -> SUBMITTED, expired quotes);
 * - atomic accept (two different quotes racing -> one order), polite rejection notices;
 * - conversations only with invited/quoting suppliers; contact reveal only after a quote;
 * - resource-level GET /api/requests/[id];
 * - request input validation (attributes, directSupplierId, AI interaction ownership);
 * - AI rating ownership; atomic order transitions; late check by Dhaka calendar day.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { OrderStatus, PaymentTerm, Priority, QuoteStatus, RequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionOptions } from "@/lib/session";
import { createBusiness } from "@/lib/repo/business";
import { createRequestRecord } from "@/lib/repo/request";
import { submitQuoteRecord, withdrawQuoteRecord, acceptQuoteAndCreateOrderRecord } from "@/lib/repo/quote";
import { updateOrderStatusRecord } from "@/lib/repo/order";
import { evaluateQuotePriorities } from "@/lib/compare/priority";
import { POST as createTicket } from "@/app/api/files/upload/route";
import { GET as readPrivateFile } from "@/app/api/files/[...key]/route";
import { GET as getRequestRoute } from "@/app/api/requests/[id]/route";
import { POST as createConversationRoute } from "@/app/api/conversations/route";
import { POST as sendMessageRoute } from "@/app/api/conversations/[id]/messages/route";
import { POST as revealContactRoute } from "@/app/api/conversations/[id]/reveal-contact/route";
import { POST as rateAiRoute } from "@/app/api/ai/rate/route";

const BASE = "http://localhost:3000";
const randomPhone = () => `+88017${Math.floor(10000000 + Math.random() * 90000000)}`;
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function cookieFor(userId: string, activeBusinessId?: string) {
  return `biznet_session=${await sealData({ userId, activeBusinessId, isLoggedIn: true }, sessionOptions)}`;
}

async function makeUser() {
  return prisma.user.create({ data: { phone: randomPhone(), name: "P3 Fix User", phoneVerified: true } });
}

async function makeBusiness(ownerId: string, opts: { supplier: boolean; categoryIds?: string[] }) {
  const biz = await createBusiness(ownerId, {
    name: `P3 Fix ${opts.supplier ? "Supplier" : "Buyer"} ${uid()}`,
    businessType: opts.supplier ? "Packaging Supplier" : "Restaurant",
    isBuyer: !opts.supplier,
    isSupplier: opts.supplier,
    area: "Mirpur",
    city: "Dhaka",
    addressLine: "Road 1",
    categoryIds: opts.categoryIds ?? [],
  } as any);
  if (!opts.supplier) return biz;
  return prisma.business.update({
    where: { id: biz.id },
    data: { verificationStatus: "VERIFIED", verifiedAt: new Date(), deliveryAreas: ["Mirpur"] },
  });
}

function json(url: string, cookie: string, body?: unknown, method = "POST") {
  return new NextRequest(`${BASE}${url}`, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const futureDate = (days: number) => new Date(Date.now() + days * 86400000);

describe("Phase 3 review fixes", () => {
  let categoryId: string;
  let buyerUser: any, buyer: any, buyerCookie: string;
  let s1User: any, s1: any, s1Cookie: string;
  let s2User: any, s2: any, s2Cookie: string;
  let outsiderUser: any, outsider: any, outsiderCookie: string;

  const quoteInput = (requestId: string, supplierBusinessId: string, userId: string, extra: Record<string, any> = {}) => ({
    requestId,
    supplierBusinessId,
    createdByUserId: userId,
    unitPrice: "10",
    quantity: "100",
    deliveryCharge: "50",
    deliveryDays: 2,
    paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
    validUntil: futureDate(5),
    specMatch: { material: "MATCH" },
    ...extra,
  });

  // Earlier tests' open requests are expired first so the 10-open-requests cap never interferes
  const newRequest = async (extra: Record<string, any> = {}) => {
    await prisma.request.updateMany({
      where: { buyerBusinessId: buyer.id, status: RequestStatus.OPEN },
      data: { status: RequestStatus.EXPIRED },
    });
    return createRequestRecord({
      buyerBusinessId: buyer.id,
      createdByUserId: buyerUser.id,
      categoryId,
      title: `Containers ${uid()}`,
      attributes: { material: "plastic_pp", capacity_ml: 750, has_lid: true },
      quantity: 100,
      unit: "pcs",
      deliveryArea: "Mirpur",
      neededBy: futureDate(7),
      quoteWindowHours: 48,
      ...extra,
    });
  };

  beforeAll(async () => {
    const cat = await prisma.category.findFirstOrThrow({ where: { slug: "containers" } });
    categoryId = cat.id;

    buyerUser = await makeUser();
    buyer = await makeBusiness(buyerUser.id, { supplier: false });
    buyerCookie = await cookieFor(buyerUser.id, buyer.id);

    s1User = await makeUser();
    s1 = await makeBusiness(s1User.id, { supplier: true, categoryIds: [categoryId] });
    s1Cookie = await cookieFor(s1User.id, s1.id);

    s2User = await makeUser();
    s2 = await makeBusiness(s2User.id, { supplier: true, categoryIds: [categoryId] });
    s2Cookie = await cookieFor(s2User.id, s2.id);

    // Verified supplier that does NOT serve the containers category
    outsiderUser = await makeUser();
    outsider = await makeBusiness(outsiderUser.id, { supplier: true, categoryIds: [] });
    outsiderCookie = await cookieFor(outsiderUser.id, outsider.id);
  });

  describe("private quote and message attachments", () => {
    it("issues quote/message upload keys under private/ for the uploader's business", async () => {
      for (const purpose of ["quote_attachment", "message_attachment"]) {
        const res = await createTicket(
          json("/api/files/upload", s1Cookie, { filename: "a.png", contentType: "image/png", sizeBytes: 1000, purpose })
        );
        expect(res.status).toBe(200);
        const ticket = await res.json();
        const folder = purpose === "quote_attachment" ? "quotes" : "messages";
        expect(ticket.key.startsWith(`private/${folder}/${s1.id}/`)).toBe(true);
      }
    });

    it("rejects quote attachment keys that belong to another business or purpose", async () => {
      const req = await newRequest();
      await expect(
        submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id, { attachmentKeys: [`private/quotes/${s2.id}/x.png`] }))
      ).rejects.toThrow(/does not belong/);
      await expect(
        submitQuoteRecord(
          quoteInput(req.id, s1.id, s1User.id, { attachmentKeys: [`private/verification/${s1.id}/doc.pdf`] })
        )
      ).rejects.toThrow(/does not belong/);
      await expect(
        submitQuoteRecord(
          quoteInput(req.id, s1.id, s1User.id, {
            attachmentKeys: [1, 2, 3, 4].map((n) => `private/quotes/${s1.id}/${n}.png`),
          })
        )
      ).rejects.toThrow(/At most 3/);
    });

    it("lets only the buyer, the quoting supplier and admins open a quote attachment", async () => {
      const req = await newRequest();
      const key = `private/quotes/${s1.id}/${uid()}-spec.pdf`;
      await submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id, { attachmentKeys: [key] }));
      const open = (cookie: string) =>
        readPrivateFile(new NextRequest(`${BASE}/api/files/${key}`, { headers: { cookie } }), {
          params: Promise.resolve({ key: key.split("/") }),
        });
      expect((await open(buyerCookie)).status).toBe(200);
      expect((await open(s1Cookie)).status).toBe(200);
      expect((await open(s2Cookie)).status).toBe(403);
      expect((await open(outsiderCookie)).status).toBe(403);
    });

    it("rejects message attachments from another business and lets only the parties open them", async () => {
      const req = await newRequest();
      await submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id));
      const conv = await (await createConversationRoute(json("/api/conversations", buyerCookie, { requestId: req.id, supplierBusinessId: s1.id }))).json();

      const foreign = await sendMessageRoute(
        json(`/api/conversations/${conv.id}/messages`, buyerCookie, { body: "see photo", attachmentKeys: [`private/messages/${s1.id}/p.png`] }),
        { params: Promise.resolve({ id: conv.id }) }
      );
      expect(foreign.status).toBe(400);

      const key = `private/messages/${buyer.id}/${uid()}-photo.png`;
      const ok = await sendMessageRoute(
        json(`/api/conversations/${conv.id}/messages`, buyerCookie, { body: "see photo", attachmentKeys: [key] }),
        { params: Promise.resolve({ id: conv.id }) }
      );
      expect(ok.status).toBe(201);

      const open = (cookie: string) =>
        readPrivateFile(new NextRequest(`${BASE}/api/files/${key}`, { headers: { cookie } }), {
          params: Promise.resolve({ key: key.split("/") }),
        });
      expect((await open(s1Cookie)).status).toBe(200);
      expect((await open(s2Cookie)).status).toBe(403);
    });
  });

  describe("quote eligibility and validation", () => {
    it("refuses quotes from suppliers that are neither invited nor serving the category", async () => {
      const req = await newRequest();
      await expect(submitQuoteRecord(quoteInput(req.id, outsider.id, outsiderUser.id))).rejects.toThrow(/does not serve/);
    });

    it("keeps a direct re-order request for the previous supplier only", async () => {
      const original = await newRequest();
      const q = await submitQuoteRecord(quoteInput(original.id, s1.id, s1User.id));
      const order = await acceptQuoteAndCreateOrderRecord(q.id, buyer.id, buyerUser.id);
      for (const to of [OrderStatus.DISPATCHED, OrderStatus.DELIVERED]) {
        await updateOrderStatusRecord({ orderId: order.id, toStatus: to, actorSide: "SUPPLIER", actorUserId: s1User.id });
      }
      await updateOrderStatusRecord({ orderId: order.id, toStatus: OrderStatus.COMPLETED, actorSide: "BUYER", actorUserId: buyerUser.id });

      const direct = await newRequest({ repeatOfRequestId: original.id, directSupplierId: s1.id });
      await expect(submitQuoteRecord(quoteInput(direct.id, s2.id, s2User.id))).rejects.toThrow(/previous supplier/);
      await expect(submitQuoteRecord(quoteInput(direct.id, s1.id, s1User.id))).resolves.toBeTruthy();
    });

    it("validates numbers, payment term and spec match on the server", async () => {
      const req = await newRequest();
      await expect(submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id, { unitPrice: "-5" }))).rejects.toThrow(/Unit price/);
      await expect(submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id, { deliveryCharge: "-1" }))).rejects.toThrow(/Delivery charge/);
      await expect(submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id, { deliveryDays: 2.5 }))).rejects.toThrow(/Delivery days/);
      await expect(submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id, { paymentTerm: "BKASH" }))).rejects.toThrow(/payment term/);
      await expect(submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id, { validUntil: futureDate(-1) }))).rejects.toThrow(/Valid-until/);
      await expect(submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id, { specMatch: { colour: "MATCH" } }))).rejects.toThrow(/Unknown spec field/);
      await expect(submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id, { specMatch: { material: "DIFFERENT" } }))).rejects.toThrow(/offered value/);

      const q = await submitQuoteRecord(
        quoteInput(req.id, s1.id, s1User.id, { specMatch: { material: "DIFFERENT", _offered: { material: "paper" } } })
      );
      expect(q.specMatch).toMatchObject({ material: "DIFFERENT", capacity_ml: "NOT_STATED", _offered: { material: "paper" } });
    });
  });

  describe("quote lifecycle and accept", () => {
    it("re-submits a withdrawn quote as SUBMITTED and blocks withdrawal once the request is closed", async () => {
      const req = await newRequest();
      const q = await submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id));
      await withdrawQuoteRecord(q.id, s1.id, s1User.id);
      const again = await submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id, { unitPrice: "9" }));
      expect(again.id).toBe(q.id);
      expect(again.status).toBe(QuoteStatus.SUBMITTED);
      expect(again.version).toBe(2);

      const q2 = await submitQuoteRecord(quoteInput(req.id, s2.id, s2User.id));
      await prisma.request.update({ where: { id: req.id }, data: { status: RequestStatus.CLOSED } });
      await expect(withdrawQuoteRecord(q2.id, s2.id, s2User.id)).rejects.toThrow(/request is CLOSED/);
    });

    it("refuses to accept an expired quote", async () => {
      const req = await newRequest();
      const q = await submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id));
      await prisma.quote.update({ where: { id: q.id }, data: { validUntil: futureDate(-1) } });
      await expect(acceptQuoteAndCreateOrderRecord(q.id, buyer.id, buyerUser.id)).rejects.toThrow(/expired/);
    });

    it("creates exactly one order when two different quotes are accepted at once", async () => {
      const req = await newRequest();
      const a = await submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id));
      const b = await submitQuoteRecord(quoteInput(req.id, s2.id, s2User.id));
      const results = await Promise.allSettled([
        acceptQuoteAndCreateOrderRecord(a.id, buyer.id, buyerUser.id),
        acceptQuoteAndCreateOrderRecord(b.id, buyer.id, buyerUser.id),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.order.count({ where: { requestId: req.id } })).toBe(1);
      expect(await prisma.quote.count({ where: { requestId: req.id, status: QuoteStatus.ACCEPTED } })).toBe(1);
    });

    it("leaves withdrawn quotes WITHDRAWN and notifies rejected suppliers", async () => {
      const req = await newRequest();
      const a = await submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id));
      const b = await submitQuoteRecord(quoteInput(req.id, s2.id, s2User.id));
      await withdrawQuoteRecord(b.id, s2.id, s2User.id);
      const extraUser = await makeUser();
      const extra = await makeBusiness(extraUser.id, { supplier: true, categoryIds: [categoryId] });
      const c = await submitQuoteRecord(quoteInput(req.id, extra.id, extraUser.id));

      await acceptQuoteAndCreateOrderRecord(a.id, buyer.id, buyerUser.id);
      expect((await prisma.quote.findUnique({ where: { id: b.id } }))!.status).toBe(QuoteStatus.WITHDRAWN);
      expect((await prisma.quote.findUnique({ where: { id: c.id } }))!.status).toBe(QuoteStatus.REJECTED);
      const notices = await prisma.notification.count({ where: { userId: extraUser.id, type: "QUOTE_NOT_SELECTED" } });
      expect(notices).toBe(1);
    });
  });

  describe("conversations and contact reveal", () => {
    it("refuses conversations with suppliers that were not invited and did not quote", async () => {
      const req = await newRequest();
      const bySupplier = await createConversationRoute(
        json("/api/conversations", outsiderCookie, { requestId: req.id, supplierBusinessId: outsider.id })
      );
      expect(bySupplier.status).toBe(403);
      const byBuyer = await createConversationRoute(
        json("/api/conversations", buyerCookie, { requestId: req.id, supplierBusinessId: outsider.id })
      );
      expect(byBuyer.status).toBe(403);
    });

    it("allows 'Show contact' only after the supplier has quoted", async () => {
      // A fresh supplier: matching invites it (serves the category in Mirpur) but it has never quoted this buyer
      const freshUser = await makeUser();
      const fresh = await makeBusiness(freshUser.id, { supplier: true, categoryIds: [categoryId] });
      const req = await newRequest();
      await prisma.requestInvite.upsert({
        where: { requestId_supplierBusinessId: { requestId: req.id, supplierBusinessId: fresh.id } },
        create: { requestId: req.id, supplierBusinessId: fresh.id, rank: 1, score: 100, reasons: ["MATCH"], notifiedAt: new Date() },
        update: {},
      });
      const conv = await (await createConversationRoute(json("/api/conversations", buyerCookie, { requestId: req.id, supplierBusinessId: fresh.id }))).json();
      expect(conv.id).toBeTruthy();
      const early = await revealContactRoute(json(`/api/conversations/${conv.id}/reveal-contact`, buyerCookie), {
        params: Promise.resolve({ id: conv.id }),
      });
      expect(early.status).toBe(400);

      await submitQuoteRecord(quoteInput(req.id, fresh.id, freshUser.id));
      const after = await revealContactRoute(json(`/api/conversations/${conv.id}/reveal-contact`, buyerCookie), {
        params: Promise.resolve({ id: conv.id }),
      });
      expect(after.status).toBe(200);
    });
  });

  describe("GET /api/requests/[id]", () => {
    it("shows the buyer every quote, a supplier only its own, and hides the request from others", async () => {
      const req = await newRequest();
      await submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id));
      await submitQuoteRecord(quoteInput(req.id, s2.id, s2User.id));
      const get = (cookie: string, id = req.code) =>
        getRequestRoute(new NextRequest(`${BASE}/api/requests/${id}`, { headers: { cookie } }), {
          params: Promise.resolve({ id }),
        });

      const asBuyer = await (await get(buyerCookie)).json();
      expect(asBuyer.viewerRole).toBe("BUYER");
      expect(asBuyer.quotes).toHaveLength(2);

      const asS1 = await (await get(s1Cookie, req.id)).json();
      expect(asS1.viewerRole).toBe("SUPPLIER");
      expect(asS1.quotes).toHaveLength(1);
      expect(asS1.quotes[0].supplierBusinessId).toBe(s1.id);
      expect(asS1.originalNeedText).toBeNull();

      expect((await get(outsiderCookie)).status).toBe(404);
      const strangerUser = await makeUser();
      const stranger = await makeBusiness(strangerUser.id, { supplier: false });
      expect((await get(await cookieFor(strangerUser.id, stranger.id))).status).toBe(404);
    });
  });

  describe("request validation", () => {
    it("requires the category's required attributes and a valid quote window", async () => {
      await expect(newRequest({ attributes: { capacity_ml: 750 } })).rejects.toThrow(/material/);
      await expect(newRequest({ quoteWindowHours: 5 })).rejects.toThrow(/Quote window/);
    });

    it("refuses a direct supplier that is not an active supplier", async () => {
      await expect(newRequest({ directSupplierId: buyer.id })).rejects.toThrow(/Direct supplier/);
      await prisma.business.update({ where: { id: outsider.id }, data: { isSuspended: true } });
      try {
        await expect(newRequest({ directSupplierId: outsider.id })).rejects.toThrow(/Direct supplier/);
      } finally {
        await prisma.business.update({ where: { id: outsider.id }, data: { isSuspended: false } });
      }
    });

    it("does not link another user's AI interaction", async () => {
      const foreign = await prisma.aiInteraction.create({
        data: {
          userId: s1User.id,
          feature: "REQUEST_ASSISTANT",
          promptVersion: "test",
          provider: "mock",
          model: "mock",
          inputHash: uid(),
          input: {},
        },
      });
      const req = await newRequest({ aiInteractionId: foreign.id });
      expect(req.aiInteractionId).toBeNull();
      expect((await prisma.aiInteraction.findUnique({ where: { id: foreign.id } }))!.outcome).toBeNull();
    });
  });

  describe("AI rating", () => {
    it("only lets the owner rate an interaction", async () => {
      const mine = await prisma.aiInteraction.create({
        data: { userId: buyerUser.id, feature: "QUOTE_COMPARISON", promptVersion: "t", provider: "mock", model: "mock", inputHash: uid(), input: {} },
      });
      const other = await rateAiRoute(json("/api/ai/rate", s1Cookie, { interactionId: mine.id, rating: -1 }));
      expect(other.status).toBe(404);
      const anon = await rateAiRoute(
        new NextRequest(`${BASE}/api/ai/rate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ interactionId: mine.id, rating: 1 }),
        })
      );
      expect(anon.status).toBe(401);
      const own = await rateAiRoute(json("/api/ai/rate", buyerCookie, { interactionId: mine.id, rating: 1 }));
      expect(own.status).toBe(200);
      expect((await prisma.aiInteraction.findUnique({ where: { id: mine.id } }))!.rating).toBe(1);
    });
  });

  describe("order transitions", () => {
    it("applies exactly one of two concurrent identical transitions", async () => {
      const req = await newRequest();
      const q = await submitQuoteRecord(quoteInput(req.id, s1.id, s1User.id));
      const order = await acceptQuoteAndCreateOrderRecord(q.id, buyer.id, buyerUser.id);
      const results = await Promise.allSettled([
        updateOrderStatusRecord({ orderId: order.id, toStatus: OrderStatus.DISPATCHED, actorSide: "SUPPLIER", actorUserId: s1User.id }),
        updateOrderStatusRecord({ orderId: order.id, toStatus: OrderStatus.DISPATCHED, actorSide: "SUPPLIER", actorUserId: s1User.id }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.orderStatusChange.count({ where: { orderId: order.id, toStatus: OrderStatus.DISPATCHED } })).toBe(1);
    });
  });

  describe("late check uses Dhaka calendar days", () => {
    it("treats arrival on the needed-by day as on time, regardless of time of day", () => {
      // 20:00 in Dhaka on Oct 27 (14:00 UTC); needed by Oct 28 (stored as Dhaka midnight)
      const now = new Date("2026-10-27T14:00:00.000Z");
      const neededBy = new Date("2026-10-27T18:00:00.000Z"); // 00:00 Oct 28 in Dhaka
      const base = { validUntil: new Date("2026-11-30T00:00:00Z"), status: QuoteStatus.SUBMITTED, specMatch: {}, paymentTerm: PaymentTerm.CASH_ON_DELIVERY };
      const res = evaluateQuotePriorities(
        [
          { ...base, id: "a", quoteRef: "Q1", totalPrice: 100, deliveryDays: 1, createdAt: now },
          { ...base, id: "b", quoteRef: "Q2", totalPrice: 90, deliveryDays: 2, createdAt: now },
        ],
        { neededBy, preferredPaymentTerm: null, priority: Priority.SPEED, comparableFieldKeys: [], todayDhaka: now },
        now
      );
      expect(res.quotes.find((q) => q.id === "a")!.isLate).toBe(false);
      expect(res.quotes.find((q) => q.id === "b")!.isLate).toBe(true);
      expect(res.serverBestFitId).toBe("a");
    });
  });
});
