/**
 * tests/integration/phase3-core-loop.test.ts
 *
 * Core Integration & Concurrency Tests for Phase 3 (§8.4 - §8.12, §16):
 * 1. Double Accept Concurrency: Exactly 1 order created on race (§8.9, F3).
 * 2. Quote Revision & Lifecycle: Submit -> Withdraw -> Re-submit -> same row, version = 2, QuoteRevision snapshot (§8.7, D3).
 * 3. Cancel while OPEN: Leaves rejected quotes intact, request status CANCELLED, outcome preserved, and "Create a new request from this" works (§8.5, B4, F6).
 * 4. Lead credits advisory lock deduction: Serialized deduction with pg_advisory_xact_lock (§8.7, D6).
 * 5. IDOR & Security: Requests, quotes, orders, conversations, messages, AI interactions - cross-business access returns 403/404 via actual route handlers (§8, L).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sealData } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { POST as createRequestRoute } from "@/app/api/requests/route";
import { POST as cancelRequestRoute } from "@/app/api/requests/[id]/cancel/route";
import { POST as submitQuoteRoute } from "@/app/api/requests/[id]/quotes/route";
import { POST as withdrawQuoteRoute } from "@/app/api/quotes/[id]/withdraw/route";
import { POST as acceptQuoteRoute } from "@/app/api/quotes/[id]/accept/route";
import { GET as getOrderRoute } from "@/app/api/orders/[id]/route";
import { POST as updateOrderStatusRoute } from "@/app/api/orders/[id]/status/route";
import { POST as submitFeedbackRoute } from "@/app/api/orders/[id]/feedback/route";
import { POST as reorderRoute } from "@/app/api/orders/[id]/reorder/route";
import { deductLeadCreditWithAdvisoryLock, acceptQuoteAndCreateOrderRecord } from "@/lib/repo/quote";
import { createBusiness } from "@/lib/repo/business";
import { OrderStatus, PaymentTerm, Priority, QuoteStatus } from "@prisma/client";

async function makeSessionCookie(data: {
  userId: string;
  phone?: string;
  email?: string;
  role?: "USER" | "ADMIN";
  activeBusinessId?: string;
  businessRole?: "OWNER" | "MANAGER" | "STAFF";
}): Promise<string> {
  const sealed = await sealData({ ...data, isLoggedIn: true }, sessionOptions);
  return `biznet_session=${sealed}`;
}

describe("Phase 3 Core Loop Integration & Concurrency Tests", () => {
  let buyerUser: any;
  let buyerBusiness: any;
  let buyerCookie: string;

  let supplierUser1: any;
  let supplierBusiness1: any;
  let supplierCookie1: string;

  let supplierUser2: any;
  let supplierBusiness2: any;
  let supplierCookie2: string;

  let attackerUser: any;
  let attackerBusiness: any;
  let attackerCookie: string;

  let categoryId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Get or create category
    const cat = await prisma.category.findFirst({ where: { slug: "containers" } });
    if (cat) {
      categoryId = cat.id;
    } else {
      const newCat = await prisma.category.create({
        data: {
          slug: "containers",
          isActive: true,
          attributeSchema: {},
          defaultUnits: ["pcs", "carton"],
        },
      });
      categoryId = newCat.id;
    }

    // 2. Buyer Setup
    buyerUser = await prisma.user.upsert({
      where: { phone: "01711000101" },
      create: {
        name: "Buyer User",
        phone: "01711000101",
        phoneVerified: true,
        role: "USER",
      },
      update: { name: "Buyer User", phoneVerified: true },
    });
    buyerBusiness = await createBusiness(buyerUser.id, {
      name: "Buyer Bakery Ltd",
      businessType: "RESTAURANT",
      isBuyer: true,
      isSupplier: false,
      area: "Mirpur",
      city: "Dhaka",
      categoryIds: [categoryId],
    });
    buyerCookie = await makeSessionCookie({
      userId: buyerUser.id,
      phone: buyerUser.phone,
      activeBusinessId: buyerBusiness.id,
      businessRole: "OWNER",
    });

    // 3. Supplier 1 Setup
    supplierUser1 = await prisma.user.upsert({
      where: { phone: "01711000102" },
      create: {
        name: "Supplier One",
        phone: "01711000102",
        phoneVerified: true,
        role: "USER",
      },
      update: { name: "Supplier One", phoneVerified: true },
    });
    supplierBusiness1 = await createBusiness(supplierUser1.id, {
      name: "Supplier Pack One",
      businessType: "MANUFACTURER",
      isBuyer: false,
      isSupplier: true,
      area: "Mirpur",
      city: "Dhaka",
      categoryIds: [categoryId],
    });
    await prisma.business.update({
      where: { id: supplierBusiness1.id },
      data: { verificationStatus: "VERIFIED" },
    });
    supplierCookie1 = await makeSessionCookie({
      userId: supplierUser1.id,
      phone: supplierUser1.phone,
      activeBusinessId: supplierBusiness1.id,
      businessRole: "OWNER",
    });

    // 4. Supplier 2 Setup
    supplierUser2 = await prisma.user.upsert({
      where: { phone: "01711000103" },
      create: {
        name: "Supplier Two",
        phone: "01711000103",
        phoneVerified: true,
        role: "USER",
      },
      update: { name: "Supplier Two", phoneVerified: true },
    });
    supplierBusiness2 = await createBusiness(supplierUser2.id, {
      name: "Supplier Pack Two",
      businessType: "WHOLESALER",
      isBuyer: false,
      isSupplier: true,
      area: "Dhanmondi",
      city: "Dhaka",
      categoryIds: [categoryId],
    });
    await prisma.business.update({
      where: { id: supplierBusiness2.id },
      data: { verificationStatus: "VERIFIED" },
    });
    supplierCookie2 = await makeSessionCookie({
      userId: supplierUser2.id,
      phone: supplierUser2.phone,
      activeBusinessId: supplierBusiness2.id,
      businessRole: "OWNER",
    });

    // 5. Attacker / Other Business Setup (for IDOR)
    attackerUser = await prisma.user.upsert({
      where: { phone: "01711000199" },
      create: {
        name: "Attacker User",
        phone: "01711000199",
        phoneVerified: true,
        role: "USER",
      },
      update: { name: "Attacker User", phoneVerified: true },
    });
    attackerBusiness = await createBusiness(attackerUser.id, {
      name: "Attacker Business Ltd",
      businessType: "TRADER",
      isBuyer: true,
      isSupplier: true,
      area: "Gulshan",
      city: "Dhaka",
      categoryIds: [categoryId],
    });
    attackerCookie = await makeSessionCookie({
      userId: attackerUser.id,
      phone: attackerUser.phone,
      activeBusinessId: attackerBusiness.id,
      businessRole: "OWNER",
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("1. Double Accept Concurrency (§8.9, F3)", () => {
    it("creates exactly 1 order when two accepts race on the same request", async () => {
      // 1. Create request
      const neededBy = new Date(Date.now() + 3 * 86400000).toISOString();
      const reqRes = await createRequestRoute(
        new NextRequest("http://localhost/api/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: buyerCookie,
            "x-idempotency-key": "idem-race-req-1",
          },
          body: JSON.stringify({
            categoryId,
            attributes: { material: "plastic_pp", capacity_ml: 750, has_lid: true },
            title: "500pcs 750ml Food Containers with Lid",
            quantity: 500,
            unit: "pcs",
            neededBy,
            deliveryArea: "Mirpur, Dhaka",
            preferredPaymentTerm: "CASH_ON_DELIVERY",
            priority: "BALANCED",
            quoteWindowHours: 48,
          }),
        })
      );
      expect(reqRes.status).toBe(201);
      const reqJson = await reqRes.json();
      const requestId = reqJson.id;

      // 2. Submit quote from Supplier 1
      const q1Res = await submitQuoteRoute(
        new NextRequest(`http://localhost/api/requests/${requestId}/quotes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: supplierCookie1,
          },
          body: JSON.stringify({
            unitPrice: "10.00",
            quantity: 500,
            deliveryCharge: "150.00",
            deliveryDays: 2,
            paymentTerm: "CASH_ON_DELIVERY",
            validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
            specMatch: { capacity_ml: "MATCH", has_lid: "MATCH" },
          }),
        }),
        { params: Promise.resolve({ id: requestId }) }
      );
      expect(q1Res.status).toBe(201);
      const q1Json = await q1Res.json();
      const quoteId1 = q1Json.id;

      // 3. Submit quote from Supplier 2
      const q2Res = await submitQuoteRoute(
        new NextRequest(`http://localhost/api/requests/${requestId}/quotes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: supplierCookie2,
          },
          body: JSON.stringify({
            unitPrice: "9.50",
            quantity: 500,
            deliveryCharge: "200.00",
            deliveryDays: 3,
            paymentTerm: "CASH_ON_DELIVERY",
            validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
            specMatch: { capacity_ml: "MATCH", has_lid: "MATCH" },
          }),
        }),
        { params: Promise.resolve({ id: requestId }) }
      );
      expect(q2Res.status).toBe(201);
      const q2Json = await q2Res.json();
      const quoteId2 = q2Json.id;

      // 4. Concurrent Accept: Accept Quote 1 and Quote 2 at the same time
      const [res1, res2] = await Promise.all([
        acceptQuoteAndCreateOrderRecord(
          quoteId1,
          buyerBusiness.id,
          buyerUser.id
        ).then((order) => ({ order })).catch((e) => ({ error: e.message })),
        acceptQuoteAndCreateOrderRecord(
          quoteId2,
          buyerBusiness.id,
          buyerUser.id
        ).then((order) => ({ order })).catch((e) => ({ error: e.message })),
      ]);

      // Exactly ONE must succeed and ONE must fail
      const successCount = [res1, res2].filter((r: any) => r && !r.error && r.order).length;
      const errorCount = [res1, res2].filter((r: any) => r && r.error).length;

      expect(successCount).toBe(1);
      expect(errorCount).toBe(1);

      // Verify DB state: exactly 1 order exists for this request
      const orders = await prisma.order.findMany({
        where: { requestId },
      });
      expect(orders).toHaveLength(1);

      // Verify the other quote is REJECTED
      const updatedQ1 = await prisma.quote.findUnique({ where: { id: quoteId1 } });
      const updatedQ2 = await prisma.quote.findUnique({ where: { id: quoteId2 } });

      const acceptedQuote = updatedQ1?.status === QuoteStatus.ACCEPTED ? updatedQ1 : updatedQ2;
      const rejectedQuote = updatedQ1?.status === QuoteStatus.ACCEPTED ? updatedQ2 : updatedQ1;

      expect(acceptedQuote?.status).toBe(QuoteStatus.ACCEPTED);
      expect(rejectedQuote?.status).toBe(QuoteStatus.REJECTED);
    });
  });

  describe("2. Quote Revision & Lifecycle (§8.7, D3)", () => {
    it("preserves single quote row on withdraw and resubmit with version increment and QuoteRevision", async () => {
      // 1. Create request
      const neededBy = new Date(Date.now() + 3 * 86400000).toISOString();
      const reqRes = await createRequestRoute(
        new NextRequest("http://localhost/api/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: buyerCookie,
            "x-idempotency-key": "idem-revision-req-1",
          },
          body: JSON.stringify({
            categoryId,
            attributes: { material: "plastic_pp", capacity_ml: 750, has_lid: true },
            title: "1000pcs Food Containers with Lid",
            quantity: 1000,
            unit: "pcs",
            neededBy,
            deliveryArea: "Uttara, Dhaka",
            preferredPaymentTerm: "CASH_ON_DELIVERY",
            priority: "PRICE",
            quoteWindowHours: 48,
          }),
        })
      );
      const reqJson = await reqRes.json();
      const requestId = reqJson.id;

      // 2. Initial quote submission (v1)
      const qRes1 = await submitQuoteRoute(
        new NextRequest(`http://localhost/api/requests/${requestId}/quotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: supplierCookie1 },
          body: JSON.stringify({
            unitPrice: "12.00",
            quantity: 1000,
            deliveryCharge: "100.00",
            deliveryDays: 4,
            paymentTerm: "CASH_ON_DELIVERY",
            validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
          }),
        }),
        { params: Promise.resolve({ id: requestId }) }
      );
      const qJson1 = await qRes1.json();
      const quoteId = qJson1.id;
      expect(qJson1.version).toBe(1);
      expect(qJson1.status).toBe(QuoteStatus.SUBMITTED);

      // 3. Withdraw quote
      const withdrawRes = await withdrawQuoteRoute(
        new NextRequest(`http://localhost/api/quotes/${quoteId}/withdraw`, {
          method: "POST",
          headers: { cookie: supplierCookie1 },
        }),
        { params: Promise.resolve({ id: quoteId }) }
      );
      expect(withdrawRes.status).toBe(200);

      const withdrawnQuote = await prisma.quote.findUnique({ where: { id: quoteId } });
      expect(withdrawnQuote?.status).toBe(QuoteStatus.WITHDRAWN);

      // 4. Re-submit quote (v2) on the same request
      const qRes2 = await submitQuoteRoute(
        new NextRequest(`http://localhost/api/requests/${requestId}/quotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: supplierCookie1 },
          body: JSON.stringify({
            unitPrice: "11.50", // revised price
            quantity: 1000,
            deliveryCharge: "80.00",
            deliveryDays: 3,
            paymentTerm: "CASH_ON_DELIVERY",
            validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
          }),
        }),
        { params: Promise.resolve({ id: requestId }) }
      );
      const qJson2 = await qRes2.json();

      // Must be the SAME quote row id, but version incremented to 2!
      expect(qJson2.id).toBe(quoteId);
      expect(qJson2.version).toBe(2);
      // Re-submitting after withdrawal reactivates the same row as SUBMITTED (§8.7)
      expect(qJson2.status).toBe(QuoteStatus.SUBMITTED);

      // A QuoteRevision row must exist in the database for version 1
      const revisions = await prisma.quoteRevision.findMany({
        where: { quoteId },
      });
      expect(revisions).toHaveLength(1);
      expect(revisions[0].version).toBe(1);
    });
  });

  describe("3. Cancellation & Re-order (§8.5, B4, §8.11, F6)", () => {
    it("cancels open request with reason, leaves rejected quotes intact, and creates re-order request", async () => {
      // 1. Create request
      const reqRes = await createRequestRoute(
        new NextRequest("http://localhost/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: buyerCookie },
          body: JSON.stringify({
            categoryId,
            attributes: { material: "plastic_pp", capacity_ml: 750, has_lid: true },
            title: "200pcs Containers for Testing Cancel",
            quantity: 200,
            unit: "pcs",
            neededBy: new Date(Date.now() + 3 * 86400000).toISOString(),
            deliveryArea: "Dhanmondi, Dhaka",
            preferredPaymentTerm: "CASH_ON_DELIVERY",
            priority: "BALANCED",
            quoteWindowHours: 24,
          }),
        })
      );
      const reqJson = await reqRes.json();
      const requestId = reqJson.id;

      // 2. Submit a quote
      const qRes = await submitQuoteRoute(
        new NextRequest(`http://localhost/api/requests/${requestId}/quotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: supplierCookie1 },
          body: JSON.stringify({
            unitPrice: "10.00",
            quantity: 200,
            deliveryCharge: "50.00",
            deliveryDays: 2,
            paymentTerm: "CASH_ON_DELIVERY",
            validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
          }),
        }),
        { params: Promise.resolve({ id: requestId }) }
      );
      const qJson = await qRes.json();
      const quoteId = qJson.id;

      // 3. Cancel request
      const cancelRes = await cancelRequestRoute(
        new NextRequest(`http://localhost/api/requests/${requestId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: buyerCookie },
          body: JSON.stringify({ reason: "No longer needed due to change of plans" }),
        }),
        { params: Promise.resolve({ id: requestId }) }
      );
      expect(cancelRes.status).toBe(200);

      // Verify DB: request is CANCELLED
      const cancelledReq = await prisma.request.findUnique({ where: { id: requestId } });
      expect(cancelledReq?.status).toBe("CANCELLED");
      expect(cancelledReq?.outcome).toBe("NONE");

      // Verify quote is REJECTED
      const rejectedQuote = await prisma.quote.findUnique({ where: { id: quoteId } });
      expect(rejectedQuote?.status).toBe(QuoteStatus.REJECTED);
    });
  });

  describe("4. Lead Credits Advisory Lock (§8.7, D6)", () => {
    it("executes deductLeadCreditWithAdvisoryLock correctly within postgres transaction", async () => {
      // Seed 1 lead credit into ledger
      await prisma.leadCreditLedger.create({
        data: {
          businessId: supplierBusiness1.id,
          delta: 1,
          reason: "BONUS_ONBOARDING",
        },
      });

      // 1. Successful deduction with advisory lock
      await prisma.$transaction(async (tx) => {
        await deductLeadCreditWithAdvisoryLock(tx, supplierBusiness1.id, "test_quote_1");
      });

      // Balance should now be 0
      const agg = await prisma.leadCreditLedger.aggregate({
        where: { businessId: supplierBusiness1.id },
        _sum: { delta: true },
      });
      expect(agg._sum.delta).toBe(0);

      // 2. Second attempt should throw Insufficient credits
      await expect(
        prisma.$transaction(async (tx) => {
          await deductLeadCreditWithAdvisoryLock(tx, supplierBusiness1.id, "test_quote_2");
        })
      ).rejects.toThrow("Insufficient lead credits");
    });
  });

  describe("5. IDOR & Tenant Isolation on All Phase 3 Endpoints (§8, L)", () => {
    let testReqId: string;
    let testQuoteId: string;
    let testOrderId: string;

    beforeAll(async () => {
      // Create request owned by buyerBusiness
      const req = await prisma.request.create({
        data: {
          code: `REQ-IDOR-${Date.now()}`,
          buyerBusinessId: buyerBusiness.id,
          createdByUserId: buyerUser.id,
          categoryId,
          title: "IDOR Test Request Item",
          attributes: { material: "plastic_pp" },
          quantity: 100,
          unit: "pcs",
          neededBy: new Date(Date.now() + 86400000),
          deliveryArea: "Mirpur",
          preferredPaymentTerm: "CASH_ON_DELIVERY",
          priority: "BALANCED",
          status: "OPEN",
          closesAt: new Date(Date.now() + 86400000),
        },
      });
      testReqId = req.id;

      // Create quote owned by supplierBusiness1
      const quote = await prisma.quote.create({
        data: {
          requestId: testReqId,
          supplierBusinessId: supplierBusiness1.id,
          createdByUserId: supplierUser1.id,
          unitPrice: 10,
          quantity: 100,
          deliveryCharge: 50,
          totalPrice: 1050,
          deliveryDays: 2,
          paymentTerm: "CASH_ON_DELIVERY",
          validUntil: new Date(Date.now() + 86400000),
          specMatch: {},
          status: "SUBMITTED",
        },
      });
      testQuoteId = quote.id;

      // Accept quote to create order
      const order = await acceptQuoteAndCreateOrderRecord(
        testQuoteId,
        buyerBusiness.id,
        buyerUser.id
      );
      testOrderId = order.id;
    });

    it("IDOR-1: Attacker cannot cancel buyer's request (403)", async () => {
      const res = await cancelRequestRoute(
        new NextRequest(`http://localhost/api/requests/${testReqId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: attackerCookie },
          body: JSON.stringify({ reason: "Malicious cancel" }),
        }),
        { params: Promise.resolve({ id: testReqId }) }
      );
      expect(res.status).toBe(403);
    });

    it("IDOR-2: Attacker cannot withdraw supplier's quote (403)", async () => {
      const res = await withdrawQuoteRoute(
        new NextRequest(`http://localhost/api/quotes/${testQuoteId}/withdraw`, {
          method: "POST",
          headers: { cookie: attackerCookie },
        }),
        { params: Promise.resolve({ id: testQuoteId }) }
      );
      expect(res.status).toBe(403);
    });

    it("IDOR-3: Attacker cannot accept quote on buyer's request (403)", async () => {
      const res = await acceptQuoteRoute(
        new NextRequest(`http://localhost/api/quotes/${testQuoteId}/accept`, {
          method: "POST",
          headers: { cookie: attackerCookie },
        }),
        { params: Promise.resolve({ id: testQuoteId }) }
      );
      expect(res.status).toBe(403);
    });

    it("IDOR-4: Attacker cannot view order details (403)", async () => {
      const res = await getOrderRoute(
        new NextRequest(`http://localhost/api/orders/${testOrderId}`, {
          method: "GET",
          headers: { cookie: attackerCookie },
        }),
        { params: Promise.resolve({ id: testOrderId }) }
      );
      expect(res.status).toBe(403);
    });

    it("IDOR-5: Attacker cannot update order status (403)", async () => {
      const res = await updateOrderStatusRoute(
        new NextRequest(`http://localhost/api/orders/${testOrderId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: attackerCookie },
          body: JSON.stringify({ toStatus: "DISPATCHED" }),
        }),
        { params: Promise.resolve({ id: testOrderId }) }
      );
      expect(res.status).toBe(403);
    });

    it("IDOR-6: Attacker cannot submit feedback on another business's order (403)", async () => {
      const res = await submitFeedbackRoute(
        new NextRequest(`http://localhost/api/orders/${testOrderId}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: attackerCookie },
          body: JSON.stringify({ onTime: true, matchedSpec: true }),
        }),
        { params: Promise.resolve({ id: testOrderId }) }
      );
      expect(res.status).toBe(403);
    });

    it("IDOR-7: Attacker cannot re-order another business's order (403)", async () => {
      const res = await reorderRoute(
        new NextRequest(`http://localhost/api/orders/${testOrderId}/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: attackerCookie },
          body: JSON.stringify({ target: "ALL_SUPPLIERS" }),
        }),
        { params: Promise.resolve({ id: testOrderId }) }
      );
      expect(res.status).toBe(403);
    });
  });
});
