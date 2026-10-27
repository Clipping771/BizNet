/**
 * Phase 5 acceptance (§16): dashboard numbers equal a hand-calculated fixture; each funnel step
 * is separate; SUPPLIER vs CONCIERGE split; ops minutes per 100 completed orders.
 *
 * The fixture lives entirely in March 2031 so nothing else in the test database falls in the window.
 *
 *   R1 buyer A, 2 Mar, AI-assisted, invites S1+S2; quotes S1 (+5 h, SUPPLIER), S2 (+30 h, SUPPLIER);
 *      AI comparison on 3 Mar; order from S1 on 4 Mar → COMPLETED, feedback on-time ✓ qty ✓ spec ✗
 *   R2 buyer A, 26 Mar, manual, invite S1, no quote            → A's second request within 30 days
 *   R3 buyer B, 10 Mar, concierge, quote S2 (+2 h, CONCIERGE); order 11 Mar → CANCELLED
 *   R4 buyer C, 15 Mar, manual, no invites, zero-match report
 */

import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { PlatformRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionOptions } from "@/lib/session";
import { computeMetrics, metricsToCsv } from "@/lib/repo/metrics";
import { GET as metricsRoute } from "@/app/api/admin/metrics/route";
import { GET as metricsExportRoute } from "@/app/api/admin/metrics/export/route";

const FROM = new Date("2031-03-01T00:00:00.000Z");
const TO = new Date("2031-04-01T00:00:00.000Z");
const at = (day: number, hours = 0) => new Date(Date.UTC(2031, 2, day, hours));
const uid = () => `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
const phone = () => `+88016${Math.floor(10000000 + Math.random() * 90000000)}`;

async function business(name: string, supplier = false) {
  return prisma.business.create({
    data: { slug: `m-${uid()}`, name, businessType: supplier ? "Supplier" : "Restaurant", isSupplier: supplier, isBuyer: !supplier, area: "Mirpur", city: "Dhaka", addressLine: "x", verificationStatus: supplier ? "VERIFIED" : "UNVERIFIED" },
  });
}

describe("Phase 5 metrics dashboard (§13)", () => {
  let adminCookie: string;
  let userCookie: string;

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { phone: phone(), name: "Metrics Fixture", phoneVerified: true } });
    const admin = await prisma.user.create({ data: { phone: phone(), name: "Metrics Admin", phoneVerified: true, role: PlatformRole.ADMIN } });
    adminCookie = `biznet_session=${await sealData({ userId: admin.id, isLoggedIn: true }, sessionOptions)}`;
    userCookie = `biznet_session=${await sealData({ userId: user.id, isLoggedIn: true }, sessionOptions)}`;

    // Clean any previous run's fixture in the window (re-runs on the same database)
    await prisma.reliabilityFeedback.deleteMany({ where: { order: { createdAt: { gte: FROM, lt: TO } } } });
    await prisma.orderStatusChange.deleteMany({ where: { order: { createdAt: { gte: FROM, lt: TO } } } });
    await prisma.order.deleteMany({ where: { createdAt: { gte: FROM, lt: TO } } });
    await prisma.request.updateMany({ where: { createdAt: { gte: FROM, lt: TO } }, data: { awardedQuoteId: null, aiInteractionId: null } });
    await prisma.quote.deleteMany({ where: { createdAt: { gte: FROM, lt: TO } } });
    await prisma.request.deleteMany({ where: { createdAt: { gte: FROM, lt: TO } } });
    await prisma.aiInteraction.deleteMany({ where: { createdAt: { gte: FROM, lt: TO } } });
    await prisma.event.deleteMany({ where: { createdAt: { gte: FROM, lt: TO } } });
    await prisma.opsTimeLog.deleteMany({ where: { createdAt: { gte: FROM, lt: TO } } });
    await prisma.report.deleteMany({ where: { createdAt: { gte: FROM, lt: TO } } });
    await prisma.question.deleteMany({ where: { createdAt: { gte: FROM, lt: TO } } });

    const [A, B, C, S1, S2] = await Promise.all([business("Buyer A"), business("Buyer B"), business("Buyer C"), business("S1", true), business("S2", true)]);
    const cat = await prisma.category.findUniqueOrThrow({ where: { slug: "containers" } });

    const ai = (data: Record<string, unknown>) =>
      prisma.aiInteraction.create({ data: { userId: user.id, promptVersion: "t", provider: "mock", model: "mock", inputHash: uid(), input: {}, ...(data as any) } });
    const i1 = await ai({ feature: "REQUEST_ASSISTANT", outcome: "ACCEPTED_AS_IS", latencyMs: 1000, costUsd: 0.01, createdAt: at(2) });
    await ai({ feature: "REQUEST_ASSISTANT", outcome: "EDITED", editedFields: ["attr_material", "quantity"], latencyMs: 3000, costUsd: 0.02, createdAt: at(8) });
    await ai({ feature: "REQUEST_ASSISTANT", outcome: "FALLBACK", latencyMs: 0, costUsd: 0, createdAt: at(9) });

    const request = (buyerId: string, day: number, extra: Record<string, unknown> = {}) =>
      prisma.request.create({
        data: { code: `REQ-M-${uid()}`, buyerBusinessId: buyerId, createdByUserId: user.id, categoryId: cat.id, title: "Metrics fixture", attributes: {}, quantity: 100, unit: "pcs", deliveryArea: "Mirpur", status: "OPEN", createdAt: at(day), ...(extra as any) },
      });
    const quote = (requestId: string, supplierId: string, createdAt: Date, source: "SUPPLIER" | "CONCIERGE" = "SUPPLIER") =>
      prisma.quote.create({
        data: { requestId, supplierBusinessId: supplierId, createdByUserId: user.id, unitPrice: 10, quantity: 100, totalPrice: 1000, deliveryDays: 2, paymentTerm: "CASH_ON_DELIVERY", validUntil: at(28), specMatch: {}, source, createdAt },
      });
    const invite = (requestId: string, supplierId: string, day: number) =>
      prisma.requestInvite.create({ data: { requestId, supplierBusinessId: supplierId, rank: 1, score: 50, reasons: ["X"], notifiedAt: at(day) } });

    const r1 = await request(A.id, 2, { aiInteractionId: i1.id, status: "AWARDED" });
    await invite(r1.id, S1.id, 2);
    await invite(r1.id, S2.id, 2);
    const q1 = await quote(r1.id, S1.id, at(2, 5));
    await quote(r1.id, S2.id, at(3, 6));
    await ai({ feature: "QUOTE_COMPARISON", outcome: "ACCEPTED_AS_IS", rating: 1, costUsd: 0.005, input: { requestId: r1.id }, output: { droppedCodeCount: 2 }, createdAt: at(3) });
    const o1 = await prisma.order.create({
      data: { code: `ORD-M-${uid()}`, requestId: r1.id, quoteId: q1.id, buyerBusinessId: A.id, supplierBusinessId: S1.id, snapshot: {}, status: "COMPLETED", createdAt: at(4), completedAt: at(9) },
    });
    await prisma.reliabilityFeedback.create({ data: { orderId: o1.id, createdByUserId: user.id, onTime: true, quantityCorrect: true, matchedSpec: false } });

    const r2 = await request(A.id, 26);
    await invite(r2.id, S1.id, 26);

    const r3 = await request(B.id, 10, { createdViaConcierge: true, status: "AWARDED" });
    const q3 = await quote(r3.id, S2.id, at(10, 2), "CONCIERGE");
    await prisma.order.create({
      data: { code: `ORD-M-${uid()}`, requestId: r3.id, quoteId: q3.id, buyerBusinessId: B.id, supplierBusinessId: S2.id, snapshot: {}, status: "CANCELLED", createdAt: at(11) },
    });

    const r4 = await request(C.id, 15);
    await prisma.report.create({ data: { reporterUserId: user.id, targetType: "REQUEST_ZERO_MATCH", targetId: r4.id, reason: "NO_ELIGIBLE_SUPPLIERS", createdAt: at(15) } });

    await prisma.event.createMany({
      data: [
        { name: "reorder_started", props: { mode: "PREVIOUS_SUPPLIER_ONLY" }, createdAt: at(25) },
        { name: "contact_blocked", createdAt: at(5) },
        { name: "contact_blocked", createdAt: at(6) },
        { name: "contact_revealed", createdAt: at(7) },
      ],
    });
    await prisma.opsTimeLog.createMany({
      data: [
        { userId: admin.id, activity: "verification_review", minutes: 10, createdAt: at(3) },
        { userId: admin.id, activity: "verification_review", minutes: 20, createdAt: at(4) },
        { userId: admin.id, activity: "CONCIERGE_QUOTE_CREATE", minutes: 6, createdAt: at(10) },
      ],
    });

    const question = (day: number, answerAfterHours: number | null) =>
      prisma.question.create({
        data: {
          authorUserId: user.id,
          title: "Metrics fixture question",
          body: "x",
          createdAt: at(day),
          ...(answerAfterHours !== null
            ? { answers: { create: { authorUserId: admin.id, body: "y", createdAt: new Date(at(day).getTime() + answerAfterHours * 3600000) } } }
            : {}),
        },
      });
    await question(5, 10);
    await question(6, 60);
    await question(7, null);
  });

  it("matches the hand-calculated funnel, step by step", async () => {
    const m = await computeMetrics(FROM, TO);
    expect(m.funnel).toMatchObject({
      requestsCreated: 4,
      uniqueBuyers: 3,
      requestsAiAssisted: 1,
      requestsManual: 2,
      requestsConcierge: 1,
      requestsWithInvite: 2,
      requestsWithQuote24h: 2,
      requestsWithSupplierQuote24h: 1,
      requestsWithConciergeQuote24h: 1,
      supplierQuote24hPct: 25,
      requestsWith2Quotes: 1,
      medianHoursToFirstQuote: 3.5,
      requestsWithOrder: 2,
      requestToOrderPct: 50,
      ordersConfirmed: 2,
      ordersCompleted: 1,
      confirmedToCompletedPct: 50,
      completedWithFeedback: 1,
      onTimePct: 100,
      quantityCorrectPct: 100,
      specMatchPct: 0,
      buyersInCohort: 3,
      buyersWithSecondRequest30d: 1,
      secondRequest30dPct: 33.3,
      buyersActive60: 0,
      active60to90Pct: 0,
      reorderPreviousSupplier: 1,
      reorderEveryone: 0,
      contactBlocked: 2,
      contactRevealed: 1,
    });
  });

  it("matches the hand-calculated AI, ops and health numbers", async () => {
    const m = await computeMetrics(FROM, TO);
    expect(m.ai).toMatchObject({
      assistantUses: 3,
      assistantAcceptedPct: 50,
      assistantEditedPct: 50,
      assistantDiscardedPct: 0,
      assistantAcceptedOrEditedPct: 100,
      assistantFallbackPct: 33.3,
      assistantLatencyP50Ms: 1000,
      comparisonUses: 1,
      ordersAfterComparisonPct: 50,
      ordersMatchingSuggestionPct: 100,
      comparisonThumbsUpPct: 100,
      comparisonDroppedCodes: 2,
    });
    expect(m.ai.mostEditedFields).toEqual(expect.arrayContaining([{ field: "attr_material", count: 1 }, { field: "quantity", count: 1 }]));
    expect(m.ops).toMatchObject({
      minutesPerVerification: 15,
      totalOpsMinutes: 36,
      opsMinutesPer100CompletedOrders: 3600,
      conciergeShareQuotesPct: 33.3,
      conciergeShareRequestsPct: 25,
    });
    expect(m.ops.minutesByActivity).toEqual([
      { activity: "verification_review", minutes: 30 },
      { activity: "CONCIERGE_QUOTE_CREATE", minutes: 6 },
    ]);
    expect(m.health).toMatchObject({
      activeBuyersLast7d: 1,
      activeSuppliersLast7d: 0,
      supplierResponseRatePct: 66.7,
      zeroEligibleRequests: 1,
      questionsAsked: 3,
      questionsAnswered48hPct: 33.3,
    });
  });

  it("flags thresholds green/red against the settings", async () => {
    const m = await computeMetrics(FROM, TO);
    expect(m.thresholds.supplierQuote24hPct).toMatchObject({ value: 25, status: "red" });
    expect(m.thresholds.requestToOrderPct).toMatchObject({ value: 50, status: "green" });
    expect(m.thresholds.confirmedToCompletedPct).toMatchObject({ value: 50, status: "red" });
    expect(m.thresholds.assistantAcceptedOrEditedPct).toMatchObject({ value: 100, status: "green" });
  });

  it("serves the dashboard and CSV to admins only", async () => {
    const url = "http://localhost:3000/api/admin/metrics?from=2031-03-01&to=2031-03-31";
    expect((await metricsRoute(new NextRequest(url, { headers: { cookie: userCookie } }))).status).toBe(403);
    const res = await metricsRoute(new NextRequest(url, { headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    // to=31 Mar is inclusive in Asia/Dhaka; the window still contains exactly the fixture
    expect((await res.json()).funnel.requestsCreated).toBe(4);

    const csvRes = await metricsExportRoute(new NextRequest(url.replace("/metrics?", "/metrics/export?"), { headers: { cookie: adminCookie } }));
    expect(csvRes.headers.get("content-type")).toContain("text/csv");
    const csv = await csvRes.text();
    expect(csv).toContain('funnel,requestsWithSupplierQuote24h,"1"');
    expect(csv).toContain('funnel,requestsWithConciergeQuote24h,"1"');
    expect(csv).toContain('ops,opsMinutesPer100CompletedOrders,"3600"');
    expect(metricsToCsv(await computeMetrics(FROM, TO)).split("\n")[0]).toBe("section,metric,value");
  });
});
