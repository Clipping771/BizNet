/**
 * Phase 5 acceptance (§16) + admin back office:
 * - in the test database, ar is auto-drafted with the mock provider; approving its critical keys
 *   allows switching it to ACTIVE (and not before); the seed keeps ar DRAFT;
 * - adding a brand-new language works end to end (add → auto-draft → approve → ACTIVE);
 * - placeholder mismatches are rejected on save and skipped on import;
 * - typed, audited settings; category schema validation; report resolution; bans enforced;
 *   CSV export with formula neutralisation; eval report token + admin alert; admin-only access.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { LanguageStatus, PlatformRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionOptions } from "@/lib/session";
import { POST as addLanguageRoute, GET as listLanguagesRoute } from "@/app/api/admin/languages/route";
import { PATCH as languageStatusRoute } from "@/app/api/admin/languages/[code]/route";
import { POST as autoDraftRoute } from "@/app/api/admin/languages/[code]/auto-draft/route";
import { POST as approveRoute } from "@/app/api/admin/languages/[code]/approve/route";
import { PUT as saveTranslationRoute } from "@/app/api/admin/languages/[code]/translations/route";
import { POST as importRoute } from "@/app/api/admin/languages/[code]/import/route";
import { GET as settingsGet, PUT as settingsPut } from "@/app/api/admin/settings/route";
import { POST as createCategoryRoute } from "@/app/api/admin/categories/route";
import { GET as reportsRoute } from "@/app/api/admin/reports/route";
import { POST as resolveReportRoute } from "@/app/api/admin/reports/[id]/route";
import { POST as banRoute } from "@/app/api/admin/users/[id]/ban/route";
import { GET as exportRoute } from "@/app/api/admin/export/route";
import { POST as evalReportPost } from "@/app/api/admin/eval-report/route";
import { POST as createQuestionRoute } from "@/app/api/questions/route";
import { getSetting } from "@/lib/settings";

const BASE = "http://localhost:3000";
const phone = () => `+88015${Math.floor(10000000 + Math.random() * 90000000)}`;
const word = () => Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

function req(method: string, url: string, cookie: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${BASE}${url}`, {
    method,
    headers: { cookie, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

describe("Phase 5 admin", () => {
  let admin: any, adminCookie: string;
  let user: any, userCookie: string;

  beforeAll(async () => {
    admin = await prisma.user.create({ data: { phone: phone(), name: "Admin P5", phoneVerified: true, role: PlatformRole.ADMIN } });
    user = await prisma.user.create({ data: { phone: phone(), name: "User P5", phoneVerified: true } });
    adminCookie = `biznet_session=${await sealData({ userId: admin.id, isLoggedIn: true }, sessionOptions)}`;
    userCookie = `biznet_session=${await sealData({ userId: user.id, isLoggedIn: true }, sessionOptions)}`;
  });

  describe("languages (§11)", () => {
    afterAll(async () => {
      // The rest of the suite (and the product) expects ar to stay an admin-only DRAFT
      await prisma.language.update({ where: { code: "ar" }, data: { status: LanguageStatus.DRAFT } });
      await prisma.uiTranslation.deleteMany({ where: { langCode: "ar", source: { in: ["MACHINE", "HUMAN"] } } });
      await prisma.uiTranslation.updateMany({ where: { langCode: "ar", source: "BUILTIN" }, data: { isApproved: true } });
      await prisma.language.deleteMany({ where: { code: { startsWith: "zz" } } });
    });

    it("seed keeps ar DRAFT", async () => {
      expect((await prisma.language.findUniqueOrThrow({ where: { code: "ar" } })).status).toBe(LanguageStatus.DRAFT);
    });

    it("ar: auto-draft with the mock provider, approve critical keys, then ACTIVE", async () => {
      await prisma.uiTranslation.updateMany({ where: { langCode: "ar" }, data: { isApproved: false } });
      const early = await languageStatusRoute(req("PATCH", "/api/admin/languages/ar", adminCookie, { status: "ACTIVE" }), params({ code: "ar" }));
      expect(early.status).toBe(400);

      const drafted = await (await autoDraftRoute(req("POST", "/api/admin/languages/ar/auto-draft", adminCookie), params({ code: "ar" }))).json();
      expect(drafted.drafted).toBeGreaterThanOrEqual(0);
      const missing = await prisma.uiString.count({ where: { translations: { none: { langCode: "ar" } } } });
      expect(missing).toBe(0);

      const approved = await (await approveRoute(req("POST", "/api/admin/languages/ar/approve", adminCookie, { criticalOnly: true }), params({ code: "ar" }))).json();
      expect(approved.approved).toBeGreaterThan(0);

      const active = await languageStatusRoute(req("PATCH", "/api/admin/languages/ar", adminCookie, { status: "ACTIVE" }), params({ code: "ar" }));
      expect(active.status).toBe(200);
      expect((await active.json()).status).toBe("ACTIVE");
      expect(await prisma.auditLog.count({ where: { entityType: "LANGUAGE", entityId: "ar", action: "LANGUAGE_STATUS_CHANGED" } })).toBeGreaterThan(0);
    });

    it("adds a new language end to end", async () => {
      const code = `zz-${word()}`;
      const added = await addLanguageRoute(req("POST", "/api/admin/languages", adminCookie, { code, nameNative: "Zed", nameEnglish: "Zed test", direction: "ltr" }));
      expect(added.status).toBe(201);
      expect((await added.json()).status).toBe("DRAFT");
      expect((await addLanguageRoute(req("POST", "/api/admin/languages", adminCookie, { code, nameNative: "Zed", nameEnglish: "Zed", direction: "ltr" }))).status).toBe(409);

      const { drafted } = await (await autoDraftRoute(req("POST", `/api/admin/languages/${code}/auto-draft`, adminCookie), params({ code }))).json();
      expect(drafted).toBe(await prisma.uiString.count());
      const sample = await prisma.uiTranslation.findFirstOrThrow({ where: { langCode: code, key: "nav.home" } });
      expect(sample.text).toMatch(/^\[ZZ-/);
      expect(sample.isApproved).toBe(false);

      await approveRoute(req("POST", `/api/admin/languages/${code}/approve`, adminCookie, { criticalOnly: true }), params({ code }));
      const res = await languageStatusRoute(req("PATCH", `/api/admin/languages/${code}`, adminCookie, { status: "ACTIVE" }), params({ code }));
      expect(res.status).toBe(200);

      const list = await (await listLanguagesRoute(req("GET", "/api/admin/languages", adminCookie))).json();
      const row = list.languages.find((l: any) => l.code === code);
      expect(row.criticalApproved).toBe(row.criticalKeys);
    });

    it("rejects placeholder mismatches on save and skips them on import", async () => {
      const key = (await prisma.uiString.findFirstOrThrow({ where: { defaultText: { contains: "{" } } })).key;
      const bad = await saveTranslationRoute(req("PUT", "/api/admin/languages/ar/translations", adminCookie, { key, text: "no placeholder here" }), params({ code: "ar" }));
      expect(bad.status).toBe(400);
      const imported = await (await importRoute(req("POST", "/api/admin/languages/ar/import", adminCookie, { [key]: "missing", "nav.home": "الرئيسية" }), params({ code: "ar" }))).json();
      expect(imported.skipped).toContain(key);
      expect(imported.imported).toBe(1);
    });

    it("is admin-only", async () => {
      expect((await listLanguagesRoute(req("GET", "/api/admin/languages", userCookie))).status).toBe(403);
      expect((await autoDraftRoute(req("POST", "/api/admin/languages/ar/auto-draft", userCookie), params({ code: "ar" }))).status).toBe(403);
    });
  });

  describe("settings, categories, reports, bans, export, eval report", () => {
    it("saves typed settings with an audit entry and rejects wrong types", async () => {
      const all = await (await settingsGet(req("GET", "/api/admin/settings", adminCookie))).json();
      expect(all.settings.marketPriceMinQuotes).toBe(8);
      expect((await settingsPut(req("PUT", "/api/admin/settings", adminCookie, { key: "maxQuotesPerRequest", value: "ten" }))).status).toBe(400);
      expect((await settingsPut(req("PUT", "/api/admin/settings", adminCookie, { key: "noSuchSetting", value: 1 }))).status).toBe(404);
      expect((await settingsPut(req("PUT", "/api/admin/settings", userCookie, { key: "maxQuotesPerRequest", value: 12 }))).status).toBe(403);
      const ok = await settingsPut(req("PUT", "/api/admin/settings", adminCookie, { key: "maxQuotesPerRequest", value: 12 }));
      expect(ok.status).toBe(200);
      expect(await getSetting("maxQuotesPerRequest")).toBe(12);
      expect(await prisma.auditLog.count({ where: { action: "SETTING_CHANGED", entityId: "maxQuotesPerRequest" } })).toBeGreaterThan(0);
      await settingsPut(req("PUT", "/api/admin/settings", adminCookie, { key: "maxQuotesPerRequest", value: 10 }));
    });

    it("validates category attribute schemas", async () => {
      const bad = await createCategoryRoute(
        req("POST", "/api/admin/categories", adminCookie, { slug: `c_${word()}`, attributeSchema: { fields: [{ key: "size", type: "select" }] }, defaultUnits: ["pcs"] })
      );
      expect(bad.status).toBe(400);
      const ok = await createCategoryRoute(
        req("POST", "/api/admin/categories", adminCookie, {
          slug: `c_${word()}`,
          attributeSchema: { fields: [{ key: "size", type: "select", options: ["s", "m"], comparable: true }] },
          defaultUnits: ["pcs"],
          sortOrder: 99,
          isActive: false,
        })
      );
      expect(ok.status).toBe(201);
    });

    it("resolves a report (audited)", async () => {
      const report = await prisma.report.create({ data: { reporterUserId: user.id, targetType: "MESSAGE", targetId: "m1", reason: "USER_REPORT" } });
      const list = await (await reportsRoute(req("GET", "/api/admin/reports", adminCookie))).json();
      expect(list.reports.map((r: any) => r.id)).toContain(report.id);
      const res = await resolveReportRoute(req("POST", `/api/admin/reports/${report.id}`, adminCookie, { status: "ACTION_TAKEN", note: "removed" }), params({ id: report.id }));
      expect((await res.json()).status).toBe("ACTION_TAKEN");
      expect(await prisma.auditLog.count({ where: { entityId: report.id, action: "REPORT_RESOLVED" } })).toBe(1);
    });

    it("bans a user and the ban is enforced", async () => {
      const target = await prisma.user.create({ data: { phone: phone(), name: "Spammer", phoneVerified: true } });
      const cookie = `biznet_session=${await sealData({ userId: target.id, isLoggedIn: true }, sessionOptions)}`;
      expect((await banRoute(req("POST", `/api/admin/users/${target.id}/ban`, adminCookie, { banned: true }), params({ id: target.id }))).status).toBe(200);
      const res = await createQuestionRoute(req("POST", "/api/questions", cookie, { title: "Is this allowed for banned users", body: "test" }));
      expect(res.status).toBe(403);
      expect((await banRoute(req("POST", `/api/admin/users/${admin.id}/ban`, adminCookie, { banned: true }), params({ id: admin.id }))).status).toBe(400);
    });

    it("exports CSV with spreadsheet formulas neutralised (audited)", async () => {
      const cat = await prisma.category.findUniqueOrThrow({ where: { slug: "containers" } });
      const biz = await prisma.business.create({ data: { slug: `x-${word()}`, name: "Exporter", businessType: "R", isBuyer: true, area: "Mirpur", city: "Dhaka", addressLine: "x" } });
      await prisma.request.create({
        data: { code: `REQ-X-${word()}`, buyerBusinessId: biz.id, createdByUserId: user.id, categoryId: cat.id, title: "=HYPERLINK(evil)", attributes: {}, quantity: 1, unit: "pcs", deliveryArea: "Mirpur", status: "OPEN" },
      });
      const today = new Date().toISOString().slice(0, 10);
      const res = await exportRoute(req("GET", `/api/admin/export?entity=requests&from=${today}&to=${today}`, adminCookie));
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain(`"'=HYPERLINK(evil)"`);
      expect((await exportRoute(req("GET", "/api/admin/export?entity=passwords", adminCookie))).status).toBe(400);
      expect(await prisma.auditLog.count({ where: { action: "DATA_EXPORTED", actorUserId: admin.id } })).toBeGreaterThan(0);
    });

    it("accepts the nightly eval report only with the CI token and alerts admins below threshold", async () => {
      process.env.EVAL_REPORT_TOKEN = "test-eval-token";
      const body = { provider: "anthropic", categoryAccuracy: 0.7, fieldAccuracy: 0.85, cases: 64 };
      expect((await evalReportPost(req("POST", "/api/admin/eval-report", "", body))).status).toBe(401);
      expect((await evalReportPost(req("POST", "/api/admin/eval-report", "", body, { authorization: "Bearer wrong-token-xx" }))).status).toBe(401);
      const ok = await evalReportPost(req("POST", "/api/admin/eval-report", "", body, { authorization: "Bearer test-eval-token" }));
      expect(ok.status).toBe(201);
      expect((await ok.json()).belowThreshold).toBe(true);
      expect((await getSetting("latestEvalReport"))?.categoryAccuracy).toBe(0.7);
      expect(await prisma.notification.count({ where: { userId: admin.id, type: "AI_EVAL_BELOW_THRESHOLD" } })).toBe(1);
    });
  });
});
