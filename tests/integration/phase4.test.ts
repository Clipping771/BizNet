/**
 * tests/integration/phase4.test.ts — Phase 4 acceptance (§16) against the seeded test database:
 * - search "বক্স", "box", "কাপ ২৫০" return the expected seeded results (+ filters, empty query safety);
 * - a selling-style question is soft-blocked, then held as PENDING_REVIEW and hidden until approved;
 * - votes / best answer rules;
 * - the seed produces exactly one publishable and one non-publishable price group;
 * - an injected extreme quote is excluded and counted; a supplier with > 40% share does not
 *   dominate the median; admin exclusions are honoured and audited; admin endpoints are admin-only.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { PlatformRole, QuestionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionOptions } from "@/lib/session";
import { GET as searchRoute } from "@/app/api/search/route";
import { GET as listQuestionsRoute, POST as createQuestionRoute } from "@/app/api/questions/route";
import { GET as getQuestionRoute } from "@/app/api/questions/[id]/route";
import { POST as answerRoute } from "@/app/api/questions/[id]/answers/route";
import { POST as bestAnswerRoute } from "@/app/api/questions/[id]/best-answer/route";
import { POST as voteRoute } from "@/app/api/votes/route";
import { POST as reviewRoute } from "@/app/api/admin/questions/[id]/review/route";
import { GET as pricesRoute } from "@/app/api/prices/route";
import { POST as recomputeRoute } from "@/app/api/admin/market-prices/recompute/route";
import { POST as exclusionRoute } from "@/app/api/admin/market-prices/exclusions/route";
import { runComputeMarketPricesJob } from "@/jobs/compute-market-prices";

const BASE = "http://localhost:3000";
const uid = () => `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
// Letters only: digit runs in post text would (rightly) trip the phone-number filter
const word = () => Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
const phone = () => `+88019${Math.floor(10000000 + Math.random() * 90000000)}`;

async function cookieFor(userId: string, activeBusinessId?: string) {
  return `biznet_session=${await sealData({ userId, activeBusinessId, isLoggedIn: true }, sessionOptions)}`;
}

function post(url: string, cookie: string, body: unknown) {
  return new NextRequest(`${BASE}${url}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function search(params: Record<string, string>) {
  const res = await searchRoute(new NextRequest(`${BASE}/api/search?${new URLSearchParams(params)}`));
  expect(res.status).toBe(200);
  return (await res.json()).results as any[];
}

describe("Phase 4", () => {
  let asker: any, askerCookie: string;
  let other: any, otherCookie: string;
  let admin: any, adminCookie: string;

  beforeAll(async () => {
    asker = await prisma.user.create({ data: { phone: phone(), name: "Asker", phoneVerified: true } });
    other = await prisma.user.create({ data: { phone: phone(), name: "Helper", phoneVerified: true } });
    admin = await prisma.user.create({ data: { phone: phone(), name: "Admin", phoneVerified: true, role: PlatformRole.ADMIN } });
    askerCookie = await cookieFor(asker.id);
    otherCookie = await cookieFor(other.id);
    adminCookie = await cookieFor(admin.id);
  });

  describe("search (§8.13)", () => {
    it('"বক্স" returns the seeded food boxes', async () => {
      const titles = (await search({ q: "বক্স", verified: "0" })).map((r) => r.title);
      expect(titles).toEqual(expect.arrayContaining(["১০০ পিস ক্রাফট পেপার বক্স", "বারবার্গার ক্রাফট বক্স"]));
    });

    it('"box" (English) finds the same Bangla listings', async () => {
      const results = await search({ q: "box", verified: "0" });
      const titles = results.map((r) => r.title);
      expect(titles).toEqual(expect.arrayContaining(["১০০ পিস ক্রাফট পেপার বক্স", "৫০০ মিলি ফুড বক্স ৩ চেম্বার"]));
    });

    it('"কাপ ২৫০" returns the 250 ml cup first', async () => {
      const results = await search({ q: "কাপ ২৫০", verified: "0" });
      expect(results[0]?.title).toBe("২৫০ মিলি পেপার কাপ");
      expect(results.map((r) => r.title)).not.toContain("প্রিমিয়াম ব্ল্যাক পেপার কাপ");
    });

    it("applies the verified, category, price and attribute filters", async () => {
      const all = await search({ q: "কন্টেইনার", verified: "0" });
      const verified = await search({ q: "কন্টেইনার", verified: "1" });
      expect(verified.every((r) => r.verificationStatus === "VERIFIED")).toBe(true);
      expect(verified.length).toBeLessThanOrEqual(all.length);

      const cups = await prisma.category.findUniqueOrThrow({ where: { slug: "cups" } });
      const paperCups = await search({ q: "", verified: "0", categoryId: cups.id, "attr.material": "paper" });
      expect(paperCups.length).toBeGreaterThan(0);
      expect(paperCups.every((r) => r.categorySlug === "cups")).toBe(true);
      const cheap = await search({ q: "", verified: "0", categoryId: cups.id, priceMax: "3.5" });
      expect(cheap.every((r) => Number(r.priceMin) <= 3.5)).toBe(true);
    });

    it("finds suppliers on the businesses tab and survives hostile input", async () => {
      const businesses = await search({ tab: "businesses", q: "বক্স", verified: "0" });
      expect(businesses.length).toBeGreaterThan(0);
      expect(businesses.every((b) => b.listingCount >= 0)).toBe(true);
      await expect(search({ q: "box') | !!:* & ((", verified: "0" })).resolves.toBeInstanceOf(Array);
      expect(await search({ q: "zzqx nothing matches", verified: "0" })).toEqual([]);
    });
  });

  describe("discussion (§8.14)", () => {
    it("soft-blocks a selling post, then holds it as PENDING_REVIEW until an admin approves", async () => {
      const draft = { title: `পাইকারি কন্টেইনার বিক্রি ${word()}`, body: "সেরা দামে কন্টেইনার পাবেন, order now" };
      const first = await createQuestionRoute(post("/api/questions", askerCookie, draft));
      expect(first.status).toBe(422);
      expect((await first.json()).blocked).toBe(true);

      const held = await createQuestionRoute(post("/api/questions", askerCookie, { ...draft, submitAnyway: true }));
      expect(held.status).toBe(201);
      const { id, status } = await held.json();
      expect(status).toBe(QuestionStatus.PENDING_REVIEW);

      const get = (cookie: string) =>
        getQuestionRoute(new NextRequest(`${BASE}/api/questions/${id}`, { headers: { cookie } }), { params: Promise.resolve({ id }) });
      expect((await get(otherCookie)).status).toBe(404);
      expect((await get("")).status).toBe(404);
      expect((await get(askerCookie)).status).toBe(200);

      const listed = await (await listQuestionsRoute(new NextRequest(`${BASE}/api/questions`, { headers: { cookie: otherCookie } }))).json();
      expect(listed.questions.map((q: any) => q.id)).not.toContain(id);

      const notAdmin = await reviewRoute(post(`/api/admin/questions/${id}/review`, otherCookie, { approve: true }), { params: Promise.resolve({ id }) });
      expect(notAdmin.status).toBe(403);
      const approved = await reviewRoute(post(`/api/admin/questions/${id}/review`, adminCookie, { approve: true }), { params: Promise.resolve({ id }) });
      expect(approved.status).toBe(200);
      expect((await get(otherCookie)).status).toBe(200);
      expect(await prisma.auditLog.count({ where: { entityId: id, action: "QUESTION_APPROVED" } })).toBe(1);
    });

    it("enforces title length, verified phone, voting and best-answer rules", async () => {
      expect((await createQuestionRoute(post("/api/questions", askerCookie, { title: "short", body: "x" }))).status).toBe(400);

      const unverified = await prisma.user.create({ data: { phone: phone(), name: "Unverified", phoneVerified: false } });
      const blocked = await createQuestionRoute(post("/api/questions", await cookieFor(unverified.id), { title: "A perfectly fine question title", body: "details" }));
      expect(blocked.status).toBe(403);

      const created = await createQuestionRoute(
        post("/api/questions", askerCookie, { title: `কাপের ঢাকনা কতটা টাইট হওয়া উচিত ${word()}`, body: "গরম চায়ের জন্য।" })
      );
      const createdJson = await created.json();
      expect(created.status, JSON.stringify(createdJson)).toBe(201);
      const { id } = createdJson;
      const ctx = { params: Promise.resolve({ id }) };

      const ans = await answerRoute(post(`/api/questions/${id}/answers`, otherCookie, { body: "স্ন্যাপ-অন ঢাকনা নিন।" }), ctx);
      expect(ans.status).toBe(201);
      const answerId = (await ans.json()).id;
      expect((await prisma.question.findUniqueOrThrow({ where: { id } })).status).toBe(QuestionStatus.ANSWERED);

      // No self-votes; repeat vote toggles off
      expect((await voteRoute(post("/api/votes", askerCookie, { targetType: "QUESTION", targetId: id, value: 1 }))).status).toBe(403);
      const up = await (await voteRoute(post("/api/votes", askerCookie, { targetType: "ANSWER", targetId: answerId, value: 1 }))).json();
      expect(up).toEqual({ score: 1, myVote: 1 });
      const off = await (await voteRoute(post("/api/votes", askerCookie, { targetType: "ANSWER", targetId: answerId, value: 1 }))).json();
      expect(off).toEqual({ score: 0, myVote: 0 });

      // Only the asker marks the best answer
      expect((await bestAnswerRoute(post(`/api/questions/${id}/best-answer`, otherCookie, { answerId }), ctx)).status).toBe(403);
      const best = await bestAnswerRoute(post(`/api/questions/${id}/best-answer`, askerCookie, { answerId }), ctx);
      expect((await best.json()).status).toBe(QuestionStatus.SOLVED);
    });

    it("refuses a selling answer", async () => {
      const q = await prisma.question.findFirstOrThrow({ where: { status: QuestionStatus.SOLVED } });
      const res = await answerRoute(post(`/api/questions/${q.id}/answers`, otherCookie, { body: "আমাদের কাছে পাবেন, কল করুন 01712345678" }), {
        params: Promise.resolve({ id: q.id }),
      });
      expect(res.status).toBe(422);
    });
  });

  describe("market prices (§8.15)", () => {
    it("the seed produces exactly one publishable and one non-publishable group", async () => {
      const snapshots = await prisma.marketPriceSnapshot.findMany({ include: { category: true } });
      expect(snapshots).toHaveLength(2);
      const publishable = snapshots.filter((s) => s.isPublishable);
      expect(publishable).toHaveLength(1);
      expect(publishable[0].category.slug).toBe("containers");
      expect(publishable[0].sampleQuotes).toBeGreaterThanOrEqual(8);
      expect(publishable[0].sampleSuppliers).toBeGreaterThanOrEqual(3);
      const notPublishable = snapshots.find((s) => !s.isPublishable)!;
      expect(notPublishable.category.slug).toBe("cups");

      const res = await (await pricesRoute()).json();
      expect(res.groups).toHaveLength(1);
      expect(Number(res.groups[0].p25)).toBeLessThanOrEqual(Number(res.groups[0].median));
    });

    describe("outliers, dominance and exclusions on an isolated category", () => {
      let categoryId: string;
      let buyerId: string;
      let buyerUserId: string;
      const suppliers: Array<{ id: string; userId: string }> = [];

      beforeAll(async () => {
        const slug = `p4_${uid()}`;
        const cat = await prisma.category.create({
          data: {
            slug,
            attributeSchema: { fields: [{ key: "size", type: "select", required: true, comparable: true, options: ["s", "m"] }] },
            defaultUnits: ["pcs"],
          },
        });
        categoryId = cat.id;
        const bu = await prisma.user.create({ data: { phone: phone(), name: "P4 Buyer", phoneVerified: true } });
        const bb = await prisma.business.create({
          data: { slug: `p4b-${uid()}`, name: "P4 Buyer", businessType: "Restaurant", isBuyer: true, area: "Mirpur", city: "Dhaka", addressLine: "x" },
        });
        buyerId = bb.id;
        buyerUserId = bu.id;
        for (let i = 0; i < 6; i++) {
          const u = await prisma.user.create({ data: { phone: phone(), name: `P4 S${i}`, phoneVerified: true } });
          const b = await prisma.business.create({
            data: { slug: `p4s-${uid()}`, name: `P4 Supplier ${i}`, businessType: "Supplier", isSupplier: true, area: "Mirpur", city: "Dhaka", addressLine: "x", verificationStatus: "VERIFIED" },
          });
          suppliers.push({ id: b.id, userId: u.id });
        }
      });

      async function addQuotes(area: string, prices: Array<[supplierIdx: number, price: number]>) {
        const created: string[] = [];
        // One request per quote keeps (request, supplier) unique however often a supplier repeats
        for (const [idx, price] of prices) {
          const req = await prisma.request.create({
            data: {
              code: `REQ-P4-${uid()}`,
              buyerBusinessId: buyerId,
              createdByUserId: buyerUserId,
              categoryId,
              title: "P4 test request",
              attributes: { size: "m" },
              quantity: 200,
              unit: "pcs",
              deliveryArea: area,
              status: "CLOSED",
            },
          });
          const q = await prisma.quote.create({
            data: {
              requestId: req.id,
              supplierBusinessId: suppliers[idx].id,
              createdByUserId: suppliers[idx].userId,
              unitPrice: price,
              quantity: 200,
              deliveryCharge: 50,
              totalPrice: price * 200 + 50,
              deliveryDays: 2,
              paymentTerm: "CASH_ON_DELIVERY",
              validUntil: new Date(Date.now() + 86400000),
              specMatch: { size: "MATCH" },
            },
          });
          created.push(q.id);
        }
        return created;
      }

      const snapshotFor = async (area: string, computedAt: Date) =>
        prisma.marketPriceSnapshot.findFirstOrThrow({ where: { categoryId, area, computedAt } });

      it("excludes and counts an injected extreme quote", async () => {
        await addQuotes("ExtremeTown", [
          [0, 10], [1, 10.4], [2, 9.8], [3, 10.2], [4, 10.1], [0, 9.9], [1, 10.3], [2, 10], [5, 250],
        ]);
        const run = await runComputeMarketPricesJob();
        const snap = await snapshotFor("ExtremeTown", run.computedAt);
        expect(snap.excludedCount).toBe(1);
        expect(Number(snap.p75)).toBeLessThan(11);
        expect(snap.sampleQuotes).toBe(8);
        expect(snap.isPublishable).toBe(true);
      });

      it("does not let a supplier with > 40% of the quotes dominate the median", async () => {
        await addQuotes("DominanceTown", [
          [0, 5], [0, 5], [0, 5], [0, 5], [0, 5], [0, 5], [1, 10], [2, 10.2], [3, 9.8], [4, 10.1],
        ]);
        const run = await runComputeMarketPricesJob();
        const snap = await snapshotFor("DominanceTown", run.computedAt);
        expect(Number(snap.median)).toBeGreaterThan(9);
        expect(snap.excludedCount).toBeGreaterThanOrEqual(5);
      });

      it("honours admin exclusions (audited) and keeps admin endpoints admin-only", async () => {
        const [quoteId] = await addQuotes("ExclusionTown", [[0, 10]]);
        expect((await exclusionRoute(post("/api/admin/market-prices/exclusions", otherCookie, { quoteId, reason: "fraud" }))).status).toBe(403);
        expect((await recomputeRoute(post("/api/admin/market-prices/recompute", otherCookie, {}))).status).toBe(403);

        const ok = await exclusionRoute(post("/api/admin/market-prices/exclusions", adminCookie, { quoteId, reason: "fraud" }));
        expect(ok.status).toBe(201);
        expect(await prisma.auditLog.count({ where: { entityId: quoteId, action: "MARKET_PRICE_EXCLUSION" } })).toBe(1);

        const run = await (await recomputeRoute(post("/api/admin/market-prices/recompute", adminCookie, {}))).json();
        const snap = await prisma.marketPriceSnapshot.findFirst({ where: { categoryId, area: "ExclusionTown", computedAt: new Date(run.computedAt) } });
        expect(snap).toBeNull();
      });
    });
  });
});
