/**
 * Phase 6 (READY features, switched off by default):
 * - lead credits: nothing is charged while off; when on, a verified supplier gets the free trial
 *   once, the first quote on a request costs 1 credit, revisions are free, 0 credits → 402;
 * - manual bKash/Nagad payments: validation, duplicate TrxID, admin approval adds credits exactly
 *   once (even when approved twice at the same time), rejection adds nothing, role checks;
 * - content translation: off → 403; on → numbers preserved, cached, readable-only, same language untouched;
 * - DB-driven language picker and cookie.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { MemberRole, PaymentTerm, PlatformRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionOptions } from "@/lib/session";
import { updateSetting } from "@/lib/settings";
import { createBusiness } from "@/lib/repo/business";
import { createRequestRecord } from "@/lib/repo/request";
import { submitQuoteRecord } from "@/lib/repo/quote";
import { creditBalance } from "@/lib/repo/credits";
import { getOrCreateConversationRecord, sendMessageRecord } from "@/lib/repo/messaging";
import { POST as submitQuoteRoute } from "@/app/api/requests/[id]/quotes/route";
import { POST as paymentRoute } from "@/app/api/credits/payments/route";
import { GET as creditsRoute } from "@/app/api/credits/route";
import { POST as reviewPaymentRoute } from "@/app/api/admin/payments/[id]/route";
import { POST as translateRoute } from "@/app/api/translate/route";
import { GET as languagesRoute } from "@/app/api/languages/route";
import { POST as setLanguageRoute } from "@/app/api/account/language/route";
import { GET as publicSettingsRoute } from "@/app/api/settings/public/route";

const BASE = "http://localhost:3000";
const phone = () => `+88013${Math.floor(10000000 + Math.random() * 90000000)}`;
const word = () => Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
const cookie = async (userId: string, activeBusinessId?: string) =>
  `biznet_session=${await sealData({ userId, activeBusinessId, isLoggedIn: true }, sessionOptions)}`;
const post = (url: string, c: string, body: unknown) =>
  new NextRequest(`${BASE}${url}`, { method: "POST", headers: { cookie: c, "content-type": "application/json" }, body: JSON.stringify(body) });

describe("Phase 6 READY features", () => {
  let categoryId: string;
  let buyerUser: any, buyer: any, buyerCookie: string;
  let supplierUser: any, supplier: any, supplierCookie: string;
  let staffCookie: string;
  let adminCookie: string;

  const newRequest = () =>
    createRequestRecord({
      buyerBusinessId: buyer.id,
      createdByUserId: buyerUser.id,
      categoryId,
      title: `Phase six ${word()}`,
      attributes: { material: "plastic_pp" },
      quantity: 100,
      unit: "pcs",
      deliveryArea: "Mirpur",
      quoteWindowHours: 48,
    });
  const quoteBody = { unitPrice: "10", quantity: "100", deliveryDays: 2, paymentTerm: PaymentTerm.CASH_ON_DELIVERY, validUntil: new Date(Date.now() + 3 * 86400000).toISOString(), specMatch: { material: "MATCH" } };

  beforeAll(async () => {
    categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "containers" } })).id;
    buyerUser = await prisma.user.create({ data: { phone: phone(), name: "P6 Buyer", phoneVerified: true } });
    buyer = await createBusiness(buyerUser.id, { name: `P6 Buyer ${word()}`, businessType: "Restaurant", isBuyer: true, isSupplier: false, area: "Mirpur", city: "Dhaka", addressLine: "x" } as any);
    buyerCookie = await cookie(buyerUser.id, buyer.id);
    supplierUser = await prisma.user.create({ data: { phone: phone(), name: "P6 Supplier", phoneVerified: true } });
    supplier = await createBusiness(supplierUser.id, { name: `P6 Supplier ${word()}`, businessType: "Supplier", isBuyer: false, isSupplier: true, area: "Mirpur", city: "Dhaka", addressLine: "x", categoryIds: [categoryId] } as any);
    await prisma.business.update({ where: { id: supplier.id }, data: { verificationStatus: "VERIFIED", deliveryAreas: ["Mirpur"] } });
    supplierCookie = await cookie(supplierUser.id, supplier.id);
    const staff = await prisma.user.create({ data: { phone: phone(), name: "P6 Staff", phoneVerified: true } });
    await prisma.membership.create({ data: { userId: staff.id, businessId: supplier.id, role: MemberRole.STAFF } });
    staffCookie = await cookie(staff.id, supplier.id);
    const admin = await prisma.user.create({ data: { phone: phone(), name: "P6 Admin", phoneVerified: true, role: PlatformRole.ADMIN } });
    adminCookie = await cookie(admin.id);
  });

  afterAll(async () => {
    // READY features stay off by default
    await updateSetting("leadCreditsEnabled", false);
    await updateSetting("translationEnabled", false);
    await updateSetting("paymentReceivers", { bkash: "", nagad: "" });
  });

  describe("lead credits", () => {
    it("charges nothing while switched off", async () => {
      await updateSetting("leadCreditsEnabled", false);
      const req = await newRequest();
      const res = await submitQuoteRoute(post(`/api/requests/${req.id}/quotes`, supplierCookie, quoteBody), { params: Promise.resolve({ id: req.id }) });
      expect(res.status).toBe(201);
      expect(await prisma.leadCreditLedger.count({ where: { businessId: supplier.id } })).toBe(0);
      const flags = await (await publicSettingsRoute()).json();
      expect(flags).toEqual({ leadCreditsEnabled: false, translationEnabled: false });
    });

    it("grants the trial once, charges the first quote per request, keeps revisions free, and returns 402 at zero", async () => {
      await updateSetting("leadCreditsEnabled", true);
      const r1 = await newRequest();
      const first = await submitQuoteRoute(post(`/api/requests/${r1.id}/quotes`, supplierCookie, quoteBody), { params: Promise.resolve({ id: r1.id }) });
      expect(first.status).toBe(201);
      expect(await creditBalance(supplier.id)).toBe(4); // 5 trial − 1
      await submitQuoteRoute(post(`/api/requests/${r1.id}/quotes`, supplierCookie, { ...quoteBody, unitPrice: "9" }), { params: Promise.resolve({ id: r1.id }) });
      expect(await creditBalance(supplier.id)).toBe(4); // revision is free
      expect(await prisma.leadCreditLedger.count({ where: { businessId: supplier.id, reason: "FREE_TRIAL" } })).toBe(1);

      await prisma.leadCreditLedger.create({ data: { businessId: supplier.id, delta: -4, reason: "TEST_DRAIN" } });
      const r2 = await newRequest();
      const broke = await submitQuoteRoute(post(`/api/requests/${r2.id}/quotes`, supplierCookie, quoteBody), { params: Promise.resolve({ id: r2.id }) });
      expect(broke.status).toBe(402);
      expect((await broke.json()).code).toBe("INSUFFICIENT_CREDITS");
      expect(await creditBalance(supplier.id)).toBe(0);
      expect(await prisma.quote.count({ where: { requestId: r2.id } })).toBe(0);
    });

    it("never goes negative under concurrent first quotes", async () => {
      await updateSetting("leadCreditsEnabled", true);
      await prisma.leadCreditLedger.create({ data: { businessId: supplier.id, delta: 1, reason: "TEST_TOPUP" } });
      const [a, b] = await Promise.all([newRequest(), newRequest()]);
      const results = await Promise.allSettled([
        submitQuoteRecord({ ...quoteBody, requestId: a.id, supplierBusinessId: supplier.id, createdByUserId: supplierUser.id }),
        submitQuoteRecord({ ...quoteBody, requestId: b.id, supplierBusinessId: supplier.id, createdByUserId: supplierUser.id }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await creditBalance(supplier.id)).toBe(0);
    });
  });

  describe("manual payments", () => {
    it("validates, rejects duplicates and role misuse, and credits exactly once on approval", async () => {
      await updateSetting("leadCreditsEnabled", false);
      expect((await paymentRoute(post("/api/credits/payments", supplierCookie, { method: "BKASH", packIndex: 0, trxId: "ABC12345", senderNumber: "01712345678" }))).status).toBe(403);

      await updateSetting("leadCreditsEnabled", true);
      await updateSetting("paymentReceivers", { bkash: "01700000000", nagad: "" });
      const overview = await (await creditsRoute(new NextRequest(`${BASE}/api/credits`, { headers: { cookie: supplierCookie } }))).json();
      expect(overview.enabled).toBe(true);
      expect(overview.receivers.bkash).toBe("01700000000");

      expect((await paymentRoute(post("/api/credits/payments", staffCookie, { method: "BKASH", packIndex: 0, trxId: "ABC12345", senderNumber: "01712345678" }))).status).toBe(403);
      expect((await paymentRoute(post("/api/credits/payments", supplierCookie, { method: "PAYPAL", packIndex: 0, trxId: "ABC12345", senderNumber: "01712345678" }))).status).toBe(400);
      expect((await paymentRoute(post("/api/credits/payments", supplierCookie, { method: "BKASH", packIndex: 0, trxId: "x", senderNumber: "01712345678" }))).status).toBe(400);

      const trxId = `TRX${word().toUpperCase()}`;
      const ok = await paymentRoute(post("/api/credits/payments", supplierCookie, { method: "BKASH", packIndex: 0, trxId, senderNumber: "017-1234-5678" }));
      expect(ok.status).toBe(201);
      const payment = await ok.json();
      expect(payment.creditsRequested).toBe(10);
      expect((await paymentRoute(post("/api/credits/payments", supplierCookie, { method: "NAGAD", packIndex: 1, trxId, senderNumber: "01712345678" }))).status).toBe(409);

      expect((await reviewPaymentRoute(post(`/api/admin/payments/${payment.id}`, supplierCookie, { approve: true }), { params: Promise.resolve({ id: payment.id }) })).status).toBe(403);
      const before = await creditBalance(supplier.id);
      const results = await Promise.all([
        reviewPaymentRoute(post(`/api/admin/payments/${payment.id}`, adminCookie, { approve: true }), { params: Promise.resolve({ id: payment.id }) }),
        reviewPaymentRoute(post(`/api/admin/payments/${payment.id}`, adminCookie, { approve: true }), { params: Promise.resolve({ id: payment.id }) }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await creditBalance(supplier.id)).toBe(before + 10);
      expect(await prisma.auditLog.count({ where: { entityId: payment.id, action: "PAYMENT_APPROVED" } })).toBe(1);

      const rejected = await (await paymentRoute(post("/api/credits/payments", supplierCookie, { method: "NAGAD", packIndex: 0, trxId: `TRX${word().toUpperCase()}`, senderNumber: "01812345678" }))).json();
      await reviewPaymentRoute(post(`/api/admin/payments/${rejected.id}`, adminCookie, { approve: false }), { params: Promise.resolve({ id: rejected.id }) });
      expect(await creditBalance(supplier.id)).toBe(before + 10);
    });
  });

  describe("content translation", () => {
    let messageId: string;

    beforeAll(async () => {
      const req = await newRequest();
      await submitQuoteRecord({ ...quoteBody, requestId: req.id, supplierBusinessId: supplier.id, createdByUserId: supplierUser.id }).catch(async () => {
        await prisma.leadCreditLedger.create({ data: { businessId: supplier.id, delta: 5, reason: "TEST_TOPUP" } });
        return submitQuoteRecord({ ...quoteBody, requestId: req.id, supplierBusinessId: supplier.id, createdByUserId: supplierUser.id });
      });
      const conv = await getOrCreateConversationRecord(req.id, buyer.id, supplier.id);
      const sent = await sendMessageRecord({ conversationId: conv.id, senderUserId: supplierUser.id, senderBusinessId: supplier.id, body: "আমরা ৫০০ পিস ৳8.50 দরে ২ দিনে দিতে পারি", lang: "bn" });
      messageId = sent.message.id;
    });

    const translate = (c: string, body: Record<string, unknown>) => translateRoute(post("/api/translate", c, body));

    it("is refused while switched off", async () => {
      await updateSetting("translationEnabled", false);
      expect((await translate(buyerCookie, { entityType: "MESSAGE", entityId: messageId, field: "body", targetLang: "en" })).status).toBe(403);
    });

    it("translates readable content, keeps every number exactly, and caches the result", async () => {
      await updateSetting("translationEnabled", true);
      const first = await (await translate(buyerCookie, { entityType: "MESSAGE", entityId: messageId, field: "body", targetLang: "en" })).json();
      expect(first.translated).toBe(true);
      expect(first.cached).toBe(false);
      expect(first.text).toBe("[EN: আমরা ৫০০ পিস ৳8.50 দরে ২ দিনে দিতে পারি]");
      const second = await (await translate(buyerCookie, { entityType: "MESSAGE", entityId: messageId, field: "body", targetLang: "en" })).json();
      expect(second.cached).toBe(true);
      expect(await prisma.contentTranslation.count({ where: { entityId: messageId } })).toBe(1);
    });

    it("refuses content the viewer cannot read, unknown fields, and leaves same-language text alone", async () => {
      await updateSetting("translationEnabled", true);
      const strangerUser = await prisma.user.create({ data: { phone: phone(), name: "Stranger", phoneVerified: true } });
      const stranger = await createBusiness(strangerUser.id, { name: `Stranger ${word()}`, businessType: "Restaurant", isBuyer: true, isSupplier: false, area: "Mirpur", city: "Dhaka", addressLine: "x" } as any);
      expect((await translate(await cookie(strangerUser.id, stranger.id), { entityType: "MESSAGE", entityId: messageId, field: "body", targetLang: "en" })).status).toBe(404);
      expect((await translate(buyerCookie, { entityType: "MESSAGE", entityId: messageId, field: "senderUserId", targetLang: "en" })).status).toBe(400);
      expect((await translate(buyerCookie, { entityType: "MESSAGE", entityId: messageId, field: "body", targetLang: "xx" })).status).toBe(400);
      const same = await (await translate(buyerCookie, { entityType: "MESSAGE", entityId: messageId, field: "body", targetLang: "bn" })).json();
      expect(same.translated).toBe(false);
    });
  });

  describe("language picker", () => {
    it("lists ACTIVE languages (admins also see drafts) and stores the choice in a cookie", async () => {
      const userList = await (await languagesRoute(new NextRequest(`${BASE}/api/languages`, { headers: { cookie: buyerCookie } }))).json();
      const codes = userList.languages.map((l: any) => l.code);
      expect(codes).toEqual(expect.arrayContaining(["bn", "en"]));
      expect(codes).not.toContain("ar");
      const adminList = await (await languagesRoute(new NextRequest(`${BASE}/api/languages`, { headers: { cookie: adminCookie } }))).json();
      expect(adminList.languages.map((l: any) => l.code)).toContain("ar");

      const set = await setLanguageRoute(post("/api/account/language", buyerCookie, { code: "en" }));
      expect(set.status).toBe(200);
      expect(set.headers.get("set-cookie")).toContain("biznet_lang=en");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: buyerUser.id } })).uiLanguage).toBe("en");
      expect((await setLanguageRoute(post("/api/account/language", buyerCookie, { code: "ar" }))).status).toBe(400);
    });
  });
});
