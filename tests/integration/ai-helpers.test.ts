/**
 * tests/integration/ai-helpers.test.ts — the optional AI helpers (F24), on the mock provider:
 * off by default, on per switch, supplier-only drafts, no invented numbers, trust signals from records.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions } from "@/lib/session";
import { defaultSettings, updateSetting } from "@/lib/settings";
import { POST as helperRoute } from "@/app/api/ai/helpers/route";
import { numbersComeFromInput } from "@/lib/ai/assist";
import { expandSearchQuery, marketInsight } from "@/lib/ai/helpers";
import { getTrustSignals } from "@/lib/repo/trust";

const BASE = "http://localhost:3000";
const uid = () => `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
const SWITCHES = ["aiListingWriterEnabled", "aiQuoteAssistantEnabled", "aiDiscussionAnswersEnabled", "aiMarketInsightEnabled", "aiSemanticSearchEnabled", "aiTrustSignalsEnabled"] as const;

async function setAll(value: boolean) {
  for (const key of SWITCHES) await updateSetting(key, value);
}

function call(cookie: string, body: unknown) {
  return helperRoute(new NextRequest(`${BASE}/api/ai/helpers`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) }));
}

describe("AI helpers (F24)", () => {
  let supplier: any, supplierCookie: string, buyerCookie: string;

  beforeAll(async () => {
    // Other suites use up or suspend the shared daily budget in this database
    await updateSetting("aiDisabledUntilDay", null);
    await prisma.aiBudgetCounter.deleteMany({});
    const make = async (isSupplier: boolean) => {
      const id = uid();
      const user = await prisma.user.create({ data: { phone: `+88019${Math.floor(10000000 + Math.random() * 90000000)}`, name: "T", phoneVerified: true } });
      const business = await prisma.business.create({
        data: { name: `Biz ${id}`, slug: `biz-${id}`, businessType: "x", addressLine: "Road 1", area: "Mirpur", city: "Dhaka", isSupplier, isBuyer: !isSupplier, verificationStatus: isSupplier ? "VERIFIED" : "UNVERIFIED", members: { create: { userId: user.id, role: "OWNER" } } } as any,
      });
      const cookie = `biznet_session=${await sealData({ userId: user.id, activeBusinessId: business.id, isLoggedIn: true }, sessionOptions)}`;
      return { user, business, cookie };
    };
    const s = await make(true);
    supplier = s.business;
    supplierCookie = s.cookie;
    buyerCookie = (await make(false)).cookie;
  });

  afterAll(async () => {
    await setAll(false);
  });

  it("every helper ships switched off", () => {
    for (const key of SWITCHES) expect(defaultSettings[key]).toBe(false);
  });

  it("refuses while the switch is off", async () => {
    await setAll(false);
    const res = await call(supplierCookie, { helper: "listing", text: "750ml PP container with lid" });
    expect(res.status).toBe(403);
    expect((await marketInsight({ groups: ["cups"], lang: "en" })).ok).toBe(false);
    expect(await getTrustSignals(supplier.id)).toEqual([]);
  });

  it("drafts a listing for a verified supplier only", async () => {
    await setAll(true);
    const ok = await call(supplierCookie, { helper: "listing", text: "750ml PP container with lid", category: "containers" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.title).toContain("750ml");
    expect((await call(buyerCookie, { helper: "listing", text: "750ml PP container" })).status).toBe(403);
  });

  it("rejects unknown helpers and missing records", async () => {
    await setAll(true);
    expect((await call(supplierCookie, { helper: "nope" })).status).toBe(400);
    expect((await call(supplierCookie, { helper: "answer", questionId: "missing" })).status).toBe(404);
    expect((await call(supplierCookie, { helper: "quote", text: "fast delivery", requestId: "missing" })).status).toBe(404);
  });

  it("a draft may repeat the input's numbers but not invent new ones", () => {
    expect(numbersComeFromInput("750ml box", "need 750ml box")).toBe(true);
    expect(numbersComeFromInput("৭৫০ মিলি", "750 ml")).toBe(true);
    expect(numbersComeFromInput("only 12.50 each", "need 750ml box")).toBe(false);
  });

  it("market insight has no digits and search expansion suggests catalog words", async () => {
    await setAll(true);
    const insight = await marketInsight({ groups: [`containers ${uid()}`], lang: "en" });
    expect(insight.ok && /\d/.test(insight.data.summary)).toBe(false);
    expect(insight.ok).toBe(true);
    const user = await prisma.user.findFirstOrThrow();
    const expansion = await expandSearchQuery({ userId: user.id, query: `box for soup ${uid()}`, categories: ["containers"] });
    expect(expansion.ok && expansion.data.terms).toEqual(["container"]);
  });

  it("trust signals come from the supplier's records", async () => {
    await setAll(true);
    expect(await getTrustSignals(supplier.id)).toEqual([]);
  });
});
