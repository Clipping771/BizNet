/**
 * tests/e2e/phase4-flow.spec.ts — Phase 4 acceptance at 360×740 (§16):
 * search "বক্স" / "box" / "কাপ ২৫০" on seeded data, the empty state, /prices (one publishable
 * group, "Not enough data yet" elsewhere), and discussion: similar questions while typing,
 * a selling post held for review, an answer, and the problem → request card.
 */

import { test, expect, type Page, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const screenshotDir = path.resolve(process.cwd(), "reports/screenshots");
const BASE = process.env.APP_URL || "http://localhost:3000";
const letters = () => Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(screenshotDir, name), fullPage: false });
}

async function visitor(browser: Browser, lang: "bn" | "en" = "bn") {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await context.addCookies([{ name: "biznet_lang", value: lang, url: BASE }]);
  return context.newPage();
}

async function loggedIn(browser: Browser, phone: string) {
  const page = await visitor(browser);
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

async function searchFor(page: Page, q: string) {
  await page.locator("#search-input").fill(q);
  await page.locator("#search-submit").click();
}

test.describe("Phase 4 acceptance at 360×740 (§16)", () => {
  test.beforeAll(() => fs.mkdirSync(screenshotDir, { recursive: true }));
  test.afterAll(async () => prisma.$disconnect());

  test("search returns the expected seeded results", async ({ browser }) => {
    const page = await visitor(browser);
    await page.goto("/search");
    await page.locator("#search-filters-toggle").click();
    await page.locator("#search-verified").uncheck();

    await searchFor(page, "বক্স");
    await expect(page.locator('[data-listing-title="১০০ পিস ক্রাফট পেপার বক্স"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-listing-title="বারবার্গার ক্রাফট বক্স"]')).toBeVisible();
    await page.locator("#search-filters-toggle").click();
    await shot(page, "20-search-bn.png");

    await searchFor(page, "box");
    await expect(page.locator('[data-listing-title="১০০ পিস ক্রাফট পেপার বক্স"]')).toBeVisible({ timeout: 10000 });

    await searchFor(page, "কাপ ২৫০");
    await expect(page.locator("[data-listing-title]").first()).toHaveAttribute("data-listing-title", "২৫০ মিলি পেপার কাপ", { timeout: 10000 });

    await page.locator("#search-tab-businesses").click();
    await expect(page.locator("[data-business-name]").first()).toBeVisible({ timeout: 10000 });

    await page.locator("#search-tab-products").click();
    await searchFor(page, "zzqx nothing");
    await expect(page.locator("#search-empty")).toBeVisible({ timeout: 10000 });
    await shot(page, "21-search-empty-bn.png");
  });

  test("/prices shows the publishable group and 'not enough data' elsewhere", async ({ browser }) => {
    const page = await visitor(browser);
    await page.goto("/prices");
    const containers = page.locator('[data-price-category="containers"]');
    await expect(containers.locator("[data-price-group]")).toHaveCount(1, { timeout: 10000 });
    await expect(page.locator('[data-price-category="cups"] [data-price-group]')).toHaveCount(0);
    await expect(page.locator('[data-price-category="cups"]')).toContainText("এখনো যথেষ্ট তথ্য নেই");
    await shot(page, "22-prices-bn.png");

    const en = await visitor(browser, "en");
    await en.goto("/prices");
    await expect(en.locator('[data-price-category="containers"]')).toContainText("Based on");
    await expect(en.locator("body")).not.toContainText(/market price/i);
    await shot(en, "23-prices-en.png");
  });

  test("discussion: similar questions, selling post held, answer, problem → request card", async ({ browser }) => {
    const phone = `+88017${Math.floor(10000000 + Math.random() * 90000000)}`;
    await prisma.user.create({ data: { phone, name: "Discussion User", phoneVerified: true } });
    const page = await loggedIn(browser, phone);

    await page.goto("/q/new");
    await page.locator("#question-title").fill("খাবারের বক্সে খাবার গরম থাকে");
    await expect(page.locator("#similar-questions")).toContainText("খাবারের বক্সে খাবার কতক্ষণ গরম থাকে?", { timeout: 10000 });
    await shot(page, "24-question-new-similar-bn.png");

    await page.locator("#question-title").fill(`পাইকারি কন্টেইনার বিক্রি করছি ${letters()}`);
    await page.locator("#question-body").fill("সেরা দাম, order now");
    await page.locator("#question-submit").click();
    await expect(page.locator("#selling-warning")).toBeVisible({ timeout: 10000 });
    await shot(page, "25-question-selling-warning-bn.png");
    await page.locator("#question-submit-anyway").click();
    await page.waitForURL(/\/q\/[a-z0-9]+$/, { timeout: 15000 });
    await expect(page.locator("#pending-review-notice")).toBeVisible();
    await expect(page.locator("#question-status")).toHaveAttribute("data-status", "PENDING_REVIEW");

    // A seeded question in a category with listings shows the request card; answer it
    const seeded = await prisma.question.findFirstOrThrow({ where: { title: "ঢাকনা সহ প্লাস্টিক কাপ কোথা থেকে কিনব?" } });
    await page.goto(`/q/${seeded.id}`);
    await expect(page.locator("#problem-request-card")).toBeVisible({ timeout: 10000 });
    await page.locator("#answer-body").fill("চকবাজারে কয়েকজন পাইকার আছেন, আগে নমুনা দেখে নিন।");
    await page.locator("#answer-submit").click();
    await expect(page.locator("#answer-list")).toContainText("আগে নমুনা দেখে নিন", { timeout: 10000 });
    await shot(page, "26-question-detail-bn.png");
    await page.locator("#problem-request-dismiss").click();
    await expect(page.locator("#problem-request-card")).toHaveCount(0);
  });
});
