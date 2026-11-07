/**
 * tests/e2e/instant-answer.spec.ts — type a need, see real suppliers and prices at once, then ask them
 * with one click, including through sign-in; repeat a past order in one click.
 */

import { test, expect, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const screenshotDir = path.resolve(process.cwd(), "reports/screenshots");
const BASE = process.env.APP_URL || "http://localhost:3000";
const BUYER_PHONE = "+8801722222203";

async function finishLogin(page: Page, phone: string) {
  await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "otp:" } } });
  await page.locator("input[type='tel']").fill(phone);
  await page.locator("button[type='submit']").click();
  const otp = page.getByTestId("otp-input");
  await expect(otp).toBeVisible({ timeout: 10000 });
  await prisma.otpCode.create({
    data: { phone, codeHash: crypto.createHash("sha256").update("123456").digest("hex"), expiresAt: new Date(Date.now() + 300000) },
  });
  await otp.fill("123456");
  await page.locator("button[type='submit']").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
}

async function visitor(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await context.addCookies([{ name: "biznet_lang", value: "en", url: BASE }]);
  return context.newPage();
}

test.describe("Instant answer at 360×740", () => {
  test.beforeAll(() => fs.mkdirSync(screenshotDir, { recursive: true }));
  test.afterAll(async () => prisma.$disconnect());

  test("a visitor gets real suppliers and prices, and keeps the need through sign-in", async ({ browser }) => {
    const page = await visitor(browser);
    await page.goto("/");
    await page.locator("#instant-input").fill("500 ta 750ml container lagbe");
    await expect(page.locator("[data-instant-supplier]").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#instant-price")).toBeVisible();
    await expect(page.locator("#instant-total")).toContainText("For 500");
    await page.screenshot({ path: path.join(screenshotDir, "42-instant-answer-en.png") });

    await page.locator("#instant-cta").click();
    await page.waitForURL(/\/login/);
    await finishLogin(page, BUYER_PHONE);
    // The assistant ran on what was typed, and the wizard opens filled in
    await expect(page.locator("#rfq-title-input")).not.toHaveValue("", { timeout: 15000 });
  });

  test("a word the catalog does not know says so and still offers to post", async ({ browser }) => {
    const page = await visitor(browser);
    await page.goto("/");
    await page.locator("#instant-input").fill("zzqx nothing");
    await expect(page.locator("#instant-none")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#instant-cta")).toBeVisible();
  });

  test("a buyer repeats a past order in one click, and sees a real saving", async ({ browser }) => {
    const order = await prisma.order.findUniqueOrThrow({ where: { code: "ORD-SEED-2" }, include: { buyerBusiness: { include: { members: { include: { user: true } } } } } });
    const phone = order.buyerBusiness.members[0].user.phone!;
    const page = await visitor(browser);
    await page.goto("/login");
    await finishLogin(page, phone);
    await page.goto("/home");

    const row = page.locator('[data-order-again="ORD-SEED-2"]');
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText("below the highest quote");
    await page.screenshot({ path: path.join(screenshotDir, "43-order-again-en.png") });

    await row.getByRole("button").first().click();
    await page.waitForURL(/\/requests\/[A-Z]/, { timeout: 15000 });
    const code = new URL(page.url()).pathname.split("/").pop()!;
    const created = await prisma.request.findUniqueOrThrow({ where: { code }, include: { invites: true } });
    expect(created.invites).toHaveLength(1);
  });
});
