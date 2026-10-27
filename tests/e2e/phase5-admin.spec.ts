/**
 * tests/e2e/phase5-admin.spec.ts — Phase 5 admin at 360×740: dashboard with thresholds and CSV,
 * reports, market prices, languages, settings, export; non-admins are refused.
 */

import { test, expect, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const screenshotDir = path.resolve(process.cwd(), "reports/screenshots");
const BASE = process.env.APP_URL || "http://localhost:3000";
const ADMIN_PHONE = "+8801700000000"; // seeded admin

async function login(browser: Browser, phone: string, lang: "bn" | "en" = "bn"): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await context.addCookies([{ name: "biznet_lang", value: lang, url: BASE }]);
  const page = await context.newPage();
  await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "otp:" } } });
  await page.goto("/login");
  await page.locator("input[type='tel']").fill(phone.replace("+880", ""));
  await page.locator("button[type='submit']").click();
  const otp = page.getByTestId("otp-input");
  await expect(otp).toBeVisible({ timeout: 10000 });
  await prisma.otpCode.create({
    data: { phone, codeHash: crypto.createHash("sha256").update("123456").digest("hex"), expiresAt: new Date(Date.now() + 300000) },
  });
  await otp.fill("123456");
  await page.locator("button[type='submit']").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  return page;
}

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(screenshotDir, name), fullPage: false });

test.describe("Phase 5 admin at 360×740", () => {
  test.beforeAll(() => fs.mkdirSync(screenshotDir, { recursive: true }));
  test.afterAll(async () => prisma.$disconnect());

  test("admin dashboard, reports, prices, languages, settings, export", async ({ browser }) => {
    test.setTimeout(120000);
    const page = await login(browser, ADMIN_PHONE);

    await page.goto("/admin");
    await expect(page.locator("#metrics-thresholds [data-threshold]").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#metrics-funnel [data-metric="requestsWithSupplierQuote24h"]')).toBeVisible();
    await expect(page.locator('#metrics-funnel [data-metric="requestsWithConciergeQuote24h"]')).toBeVisible();
    await expect(page.locator('#metrics-ops [data-metric="opsMinutesPer100CompletedOrders"]')).toBeVisible();
    await shot(page, "27-admin-dashboard-bn.png");

    const csv = await page.request.get(`/api/admin/metrics/export?from=2026-01-01&to=2026-12-31`);
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain("section,metric,value");

    await page.goto("/admin/reports");
    await expect(page.locator("h2").first()).toBeVisible();
    await shot(page, "28-admin-reports-bn.png");

    await page.goto("/admin/market-prices");
    await expect(page.locator("#prices-recompute")).toBeVisible();
    await shot(page, "29-admin-market-prices-bn.png");

    await page.goto("/admin/languages");
    await expect(page.locator('[data-language="ar"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-language="ar"] select')).toHaveValue("DRAFT");
    await shot(page, "30-admin-languages-bn.png");

    await page.goto("/admin/settings");
    await expect(page.locator('[data-setting="marketPriceMinQuotes"]')).toBeVisible({ timeout: 10000 });
    await shot(page, "31-admin-settings-bn.png");

    await page.goto("/admin/export");
    const download = await page.request.get(await page.locator("#export-download").getAttribute("href") as string);
    expect(download.headers()["content-type"]).toContain("text/csv");
  });

  test("non-admins are refused", async ({ browser }) => {
    const phone = `+88017${Math.floor(10000000 + Math.random() * 90000000)}`;
    await prisma.user.create({ data: { phone, name: "Not admin", phoneVerified: true } });
    const page = await login(browser, phone);
    const res = await page.request.get("/api/admin/metrics");
    expect(res.status()).toBe(403);
    await page.goto("/admin");
    await expect(page.locator("text=শুধু অ্যাডমিনদের জন্য।")).toBeVisible({ timeout: 10000 });
  });

  test("health endpoint and error page", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
    const page = await context.newPage();
    const health = await page.request.get("/api/health");
    expect(health.status()).toBe(200);
    expect((await health.json()).db).toBe("ok");
    await page.goto("/this-page-does-not-exist");
    await expect(page.locator("h1")).toBeVisible();
    const crossSite = await page.request.post("/api/reports", { headers: { origin: "https://evil.example" }, data: {} });
    expect(crossSite.status()).toBe(403);
  });
});
