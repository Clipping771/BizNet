/**
 * Phase 5 hardening (§10, §14): mutation rate limits, cross-site (Origin) blocking, idempotent
 * quote submit and order confirm, text sanitisation, audit coverage, /api/health.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { PaymentTerm } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionOptions } from "@/lib/session";
import { middleware } from "@/middleware";
import { sanitizeText } from "@/lib/http/guard";
import { createBusiness } from "@/lib/repo/business";
import { createRequestRecord } from "@/lib/repo/request";
import { submitQuoteRecord, acceptQuoteAndCreateOrderRecord } from "@/lib/repo/quote";
import { submitReliabilityFeedbackRecord, updateOrderStatusRecord } from "@/lib/repo/order";
import { revealContactRecord } from "@/lib/repo/messaging";
import { POST as reportRoute } from "@/app/api/reports/route";
import { GET as healthRoute } from "@/app/api/health/route";

const BASE = "http://localhost:3000";
const phone = () => `+88014${Math.floor(10000000 + Math.random() * 90000000)}`;
const word = () => Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

describe("Phase 5 hardening", () => {
  it("rate-limits a mutation per user (429 with retry-after)", async () => {
    const user = await prisma.user.create({ data: { phone: phone(), name: "Limiter", phoneVerified: true } });
    const cookie = `biznet_session=${await sealData({ userId: user.id, isLoggedIn: true }, sessionOptions)}`;
    const send = () =>
      reportRoute(
        new NextRequest(`${BASE}/api/reports`, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ targetType: "MESSAGE", targetId: "x", reason: "USER_REPORT" }),
        })
      );
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await send()).status);
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    const last = await send();
    expect(last.status).toBe(429);
    expect(Number(last.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("blocks cross-site API mutations but allows same-origin and safe methods", async () => {
    const mk = (method: string, origin?: string) =>
      new NextRequest(`${BASE}/api/reports`, { method, headers: { host: "localhost:3000", ...(origin ? { origin } : {}) } });
    expect((await middleware(mk("POST", "https://evil.example")))?.status).toBe(403);
    expect((await middleware(mk("DELETE", "null")))?.status).toBe(403);
    expect((await middleware(mk("POST", "http://localhost:3000")))?.status).not.toBe(403);
    expect((await middleware(mk("POST")))?.status).not.toBe(403);
    expect((await middleware(mk("GET", "https://evil.example")))?.status).not.toBe(403);
  });

  it("strips control and bidi-override characters but keeps Bangla joiners", () => {
    expect(sanitizeText("  hi\u0000 there\u202E  ")).toBe("hi there");
    expect(sanitizeText("line1\nline2\tx")).toBe("line1\nline2\tx");
    const conjunct = "ক্\u200Dষ"; // ZWJ used in Bangla conjunct shaping
    expect(sanitizeText(conjunct)).toBe(conjunct);
  });

  describe("idempotency and audit on the core loop", () => {
    let buyerUser: any, buyer: any, supplierUser: any, supplier: any, categoryId: string;

    beforeAll(async () => {
      categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "containers" } })).id;
      buyerUser = await prisma.user.create({ data: { phone: phone(), name: "Idem Buyer", phoneVerified: true } });
      buyer = await createBusiness(buyerUser.id, { name: `Idem Buyer ${word()}`, businessType: "Restaurant", isBuyer: true, isSupplier: false, area: "Mirpur", city: "Dhaka", addressLine: "x" } as any);
      supplierUser = await prisma.user.create({ data: { phone: phone(), name: "Idem Supplier", phoneVerified: true } });
      supplier = await createBusiness(supplierUser.id, { name: `Idem Supplier ${word()}`, businessType: "Supplier", isBuyer: false, isSupplier: true, area: "Mirpur", city: "Dhaka", addressLine: "x", categoryIds: [categoryId] } as any);
      await prisma.business.update({ where: { id: supplier.id }, data: { verificationStatus: "VERIFIED", deliveryAreas: ["Mirpur"] } });
    });

    it("returns the stored quote for a retried submit and the existing order for a repeated confirm; audits reveal and feedback", async () => {
      const req = await createRequestRecord({
        buyerBusinessId: buyer.id,
        createdByUserId: buyerUser.id,
        categoryId,
        title: `Idempotency ${word()}`,
        attributes: { material: "plastic_pp" },
        quantity: 100,
        unit: "pcs",
        deliveryArea: "Mirpur",
        quoteWindowHours: 48,
      });
      const input = {
        requestId: req.id,
        supplierBusinessId: supplier.id,
        createdByUserId: supplierUser.id,
        unitPrice: "10",
        quantity: "100",
        deliveryDays: 2,
        paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
        validUntil: new Date(Date.now() + 3 * 86400000),
        specMatch: { material: "MATCH" },
        notes: "first\u0007 note",
        idempotencyKey: `idem-${word()}`,
      };
      const first = await submitQuoteRecord(input);
      expect(first.notes).toBe("first note");
      const retry = await submitQuoteRecord({ ...input, unitPrice: "9" });
      expect(retry.id).toBe(first.id);
      expect(retry.version).toBe(1);
      expect(await prisma.quoteRevision.count({ where: { quoteId: first.id } })).toBe(0);

      const order = await acceptQuoteAndCreateOrderRecord(first.id, buyer.id, buyerUser.id);
      const again = await acceptQuoteAndCreateOrderRecord(first.id, buyer.id, buyerUser.id);
      expect(again.id).toBe(order.id);

      await revealContactRecord(buyer.id, supplier.id, buyerUser.id);
      expect(await prisma.auditLog.count({ where: { action: "CONTACT_REVEALED", actorBusinessId: buyer.id } })).toBe(1);

      for (const to of ["DISPATCHED", "DELIVERED"] as const) {
        await updateOrderStatusRecord({ orderId: order.id, toStatus: to, actorSide: "SUPPLIER", actorUserId: supplierUser.id });
      }
      await updateOrderStatusRecord({ orderId: order.id, toStatus: "COMPLETED", actorSide: "BUYER", actorUserId: buyerUser.id });
      await submitReliabilityFeedbackRecord({ orderId: order.id, userId: buyerUser.id, buyerBusinessId: buyer.id, onTime: true });
      expect(await prisma.auditLog.count({ where: { action: "FEEDBACK_GIVEN", entityId: order.id } })).toBe(1);
    });
  });

  it("reports health of database, storage and queue", async () => {
    const res = await healthRoute();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.db).toBe("ok");
    expect(["ok", "memory"]).toContain(json.storage);
    expect(["ok", "not-started"]).toContain(json.queue);
  });
});
