/**
 * tests/e2e/ui-navigation.spec.ts — the bottom-nav screens a returning user relies on, at 360×740:
 * home activity, Requests list, Orders, Quotes, Inbox (unread badge → conversation), Notifications
 * (header bell → mark all read), and Bangla digits on the request page.
 */

import { test, expect, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const screenshotDir = path.resolve(process.cwd(), "reports/screenshots");
const BASE = process.env.APP_URL || "http://localhost:3000";
const BUYER_PHONE = "+8801722222203"; // North End Coffee — REQ-SEED-OPEN-1 with two quotes
const SUPPLIER_PHONE = "+8801711111101"; // Dhaka Pack & Print — quoted on REQ-SEED-OPEN-1

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

test.describe("Bottom-nav screens at 360×740", () => {
  test.beforeAll(() => fs.mkdirSync(screenshotDir, { recursive: true }));
  test.afterAll(async () => prisma.$disconnect());

  test("buyer: home, requests, inbox, notifications", async ({ browser }) => {
    test.setTimeout(120000);
    const buyerUser = await prisma.user.findUniqueOrThrow({ where: { phone: BUYER_PHONE } });
    const request = await prisma.request.findUniqueOrThrow({ where: { code: "REQ-SEED-OPEN-1" } });
    const supplier = await prisma.business.findUniqueOrThrow({ where: { slug: "dhaka-pack-print" } });
    const supplierUser = await prisma.user.findUniqueOrThrow({ where: { phone: SUPPLIER_PHONE } });

    // A fresh unread message and notification for the buyer
    const conv = await prisma.conversation.upsert({
      where: { requestId_supplierBusinessId: { requestId: request.id, supplierBusinessId: supplier.id } },
      update: {},
      create: { requestId: request.id, buyerBusinessId: request.buyerBusinessId, supplierBusinessId: supplier.id },
    });
    await prisma.message.updateMany({ where: { conversationId: conv.id }, data: { readAt: new Date() } });
    await prisma.message.create({ data: { conversationId: conv.id, senderUserId: supplierUser.id, senderBusinessId: supplier.id, body: "We can deliver tomorrow morning", lang: "en" } });
    await prisma.notification.updateMany({ where: { userId: buyerUser.id }, data: { readAt: new Date() } });
    await prisma.notification.create({
      data: { userId: buyerUser.id, type: "QUOTE_RECEIVED", params: { requestCode: request.code }, link: `/requests/${request.code}` },
    });

    const page = await login(browser, BUYER_PHONE);

    await page.goto("/home");
    await expect(page.locator("#home-activity")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#home-open-requests")).toContainText("১");
    await expect(page.locator("#header-unread")).toHaveText("১");
    await shot(page, "36-home-activity-bn.png");

    await page.locator("nav").getByRole("link", { name: "অনুরোধ" }).click();
    await page.waitForURL(/\/requests$/);
    await expect(page.locator(`[data-request-code="${request.code}"]`)).toBeVisible({ timeout: 10000 });
    await shot(page, "37-requests-list-bn.png");

    await page.locator(`[data-request-code="${request.code}"]`).click();
    await page.waitForURL(new RegExp(`/requests/${request.code}`));
    await expect(page.locator("text=৫০০ pcs").first()).toBeVisible({ timeout: 10000 });

    await page.goto("/inbox");
    const row = page.locator(`[data-conversation="${conv.id}"]`);
    await expect(row.locator("[data-unread]")).toBeVisible({ timeout: 10000 });
    await shot(page, "38-inbox-bn.png");
    await row.click();
    await expect(page.locator("#chat-panel")).toContainText("We can deliver tomorrow morning", { timeout: 10000 });
    await page.goto("/inbox");
    await expect(page.locator(`[data-conversation="${conv.id}"] [data-unread]`)).toHaveCount(0, { timeout: 10000 });

    await page.locator("#header-notifications").click();
    await page.waitForURL(/\/notifications$/);
    await expect(page.locator('[data-notification="QUOTE_RECEIVED"][data-read="false"]').first()).toBeVisible({ timeout: 10000 });
    await shot(page, "39-notifications-bn.png");
    await page.locator("#notifications-mark-all").click();
    await expect(page.locator('[data-read="false"]')).toHaveCount(0, { timeout: 10000 });
  });

  test("supplier: quotes and orders lists", async ({ browser }) => {
    const page = await login(browser, SUPPLIER_PHONE);
    await page.goto("/quotes");
    await expect(page.locator("#quote-list a").first()).toBeVisible({ timeout: 10000 });
    await shot(page, "40-quotes-list-bn.png");
    await page.goto("/orders");
    await expect(page.locator("#order-list a").first()).toBeVisible({ timeout: 10000 });
    await shot(page, "41-orders-list-bn.png");
  });
});
