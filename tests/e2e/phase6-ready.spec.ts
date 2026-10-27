/**
 * tests/e2e/phase6-ready.spec.ts — Phase 6 READY features at 360×740, switched on for the test only:
 * supplier sees the free trial and submits a bKash payment, admin approves it (credits added),
 * a buyer translates a Bangla message ("Translated · Show original"), and the language picker
 * stores the choice. Switches are turned back off afterwards (the product default).
 */

import { test, expect, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const screenshotDir = path.resolve(process.cwd(), "reports/screenshots");
const BASE = process.env.APP_URL || "http://localhost:3000";
const SUPPLIER_PHONE = "+8801711111101"; // Dhaka Pack & Print (VERIFIED)
const BUYER_PHONE = "+8801722222203"; // North End Coffee, owner of REQ-SEED-OPEN-1
const ADMIN_PHONE = "+8801700000000";

async function login(browser: Browser, phone: string, lang: "bn" | "en"): Promise<Page> {
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
const setSetting = (key: string, value: unknown) =>
  prisma.setting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } });

test.describe("Phase 6 READY features at 360×740", () => {
  test.beforeAll(async () => {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await setSetting("leadCreditsEnabled", true);
    await setSetting("translationEnabled", true);
    await setSetting("paymentReceivers", { bkash: "01700000000", nagad: "01800000000" });
  });

  test.afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: { in: ["leadCreditsEnabled", "translationEnabled", "paymentReceivers"] } } });
    await prisma.$disconnect();
  });

  test("credits: free trial, bKash payment, admin approval", async ({ browser }) => {
    test.setTimeout(120000);
    const supplier = await prisma.business.findUniqueOrThrow({ where: { slug: "dhaka-pack-print" } });
    await prisma.leadCreditLedger.deleteMany({ where: { businessId: supplier.id } });

    const page = await login(browser, SUPPLIER_PHONE, "bn");
    await page.goto("/business/credits");
    await expect(page.locator("#credits-balance")).toHaveAttribute("data-balance", "5", { timeout: 15000 });
    const trx = `E2E${Date.now().toString(36).toUpperCase()}`;
    await page.locator("#credits-trx").fill(trx);
    await page.locator("#credits-sender").fill("01712345678");
    await page.locator("#credits-submit").click();
    await expect(page.locator("#credits-submitted")).toBeVisible({ timeout: 10000 });
    await shot(page, "32-credits-bn.png");

    const admin = await login(browser, ADMIN_PHONE, "bn");
    await admin.goto("/admin/payments");
    const card = admin.locator(`[data-payment="${trx}"]`);
    await expect(card).toBeVisible({ timeout: 10000 });
    await shot(admin, "33-admin-payments-bn.png");
    await card.locator("button").first().click();
    await expect(card).toHaveCount(0, { timeout: 10000 });

    await page.reload();
    await expect(page.locator("#credits-balance")).toHaveAttribute("data-balance", "15", { timeout: 10000 });
  });

  test("translation: a Bangla message translated for an English buyer, numbers kept", async ({ browser }) => {
    const request = await prisma.request.findUniqueOrThrow({ where: { code: "REQ-SEED-OPEN-1" } });
    const supplier = await prisma.business.findUniqueOrThrow({ where: { slug: "dhaka-pack-print" } });
    const supplierUser = await prisma.user.findUniqueOrThrow({ where: { phone: SUPPLIER_PHONE } });
    const conv = await prisma.conversation.upsert({
      where: { requestId_supplierBusinessId: { requestId: request.id, supplierBusinessId: supplier.id } },
      update: {},
      create: { requestId: request.id, buyerBusinessId: request.buyerBusinessId, supplierBusinessId: supplier.id },
    });
    const body = `কাল ৫০০ পিস ৳8.80 দরে দিতে পারব ${Date.now().toString(36)}`;
    await prisma.message.create({ data: { conversationId: conv.id, senderUserId: supplierUser.id, senderBusinessId: supplier.id, body, lang: "bn" } });

    const page = await login(browser, BUYER_PHONE, "en");
    await page.goto(`/requests/${request.code}`);
    await page.locator(`[data-supplier="${supplier.name}"] [id^='message-supplier-btn-']`).click();
    const panel = page.locator("#chat-panel");
    await expect(panel).toBeVisible({ timeout: 10000 });
    const message = panel.locator("[data-translated]", { hasText: body.slice(0, 10) }).last();
    await expect(message).toBeVisible({ timeout: 10000 });
    await panel.locator("[data-translate-button]").last().click();
    await expect(panel.locator('[data-translated="true"]').last()).toContainText("[EN:", { timeout: 10000 });
    await expect(panel.locator('[data-translated="true"]').last()).toContainText("৫০০ পিস");
    await expect(panel.locator('[data-translated="true"]').last()).toContainText("৳8.80");
    await expect(panel.locator("text=Show original").last()).toBeVisible();
    await shot(page, "34-translated-message-en.png");
  });

  test("language picker stores the choice", async ({ browser }) => {
    const page = await login(browser, BUYER_PHONE, "bn");
    await page.goto("/account/language");
    await page.locator("#language-en").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en", { timeout: 10000 });
    await page.goto("/home");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.goto("/account/language");
    await shot(page, "35-language-picker-en.png");
    await expect(page.locator("#language-ar")).toHaveCount(0);
  });
});
