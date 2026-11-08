/**
 * tests/e2e/responsive.spec.ts — the app fits phone, tablet and desktop screens: no page scrolls sideways,
 * list tables show their status on phones, and every page stays reachable from the phone menu.
 */

import { test, expect, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient();
const BASE = process.env.APP_URL || "http://localhost:3000";
const BUYER_PHONE = "+8801722222203";
const SIZES = [
  { width: 360, height: 740 },
  { width: 820, height: 1100 },
  { width: 1366, height: 850 },
];

async function signedIn(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: "biznet_lang", value: "en", url: BASE }]);
  const page = await context.newPage();
  await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "otp:" } } });
  await page.goto("/login");
  await page.locator("input[type='tel']").fill(BUYER_PHONE);
  await page.locator("button[type='submit']").click();
  const otp = page.getByTestId("otp-input");
  await expect(otp).toBeVisible({ timeout: 10000 });
  await prisma.otpCode.create({
    data: { phone: BUYER_PHONE, codeHash: crypto.createHash("sha256").update("123456").digest("hex"), expiresAt: new Date(Date.now() + 300000) },
  });
  await otp.fill("123456");
  await page.locator("button[type='submit']").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  return page;
}

test.describe("Responsive layout", () => {
  test.afterAll(async () => prisma.$disconnect());

  for (const size of SIZES) {
    test(`no page scrolls sideways at ${size.width}px`, async ({ browser }) => {
      test.setTimeout(120000);
      const page = await signedIn(browser, size);
      for (const route of ["/home", "/requests", "/orders", "/search", "/inbox", "/prices"]) {
        await page.goto(route, { waitUntil: "networkidle" });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, route).toBeLessThanOrEqual(0);
      }
    });
  }

  test("a phone shows a request's status without scrolling sideways", async ({ browser }) => {
    const page = await signedIn(browser, SIZES[0]);
    await page.goto("/requests");
    const chip = page.locator('[data-request-code="REQ-SEED-OPEN-1"] td').nth(4);
    await expect(chip).toBeVisible({ timeout: 10000 });
    const box = await chip.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(SIZES[0].width);
  });

  test("the phone menu reaches the pages the tab bar has no room for", async ({ browser }) => {
    const page = await signedIn(browser, SIZES[0]);
    await page.goto("/home");
    await page.locator("#nav-more").click();
    const sheet = page.locator("#more-sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("link", { name: "Market prices" }).click();
    await page.waitForURL(/\/prices$/);
    await expect(sheet).toBeHidden();
  });

  test("a tablet gets the icon rail and a desktop the labelled sidebar", async ({ browser }) => {
    const tablet = await signedIn(browser, SIZES[1]);
    const railWidth = await tablet.locator("aside").first().evaluate((el) => el.getBoundingClientRect().width);
    expect(railWidth).toBeLessThan(100);
    const desktop = await signedIn(browser, SIZES[2]);
    const sidebarWidth = await desktop.locator("aside").first().evaluate((el) => el.getBoundingClientRect().width);
    expect(sidebarWidth).toBeGreaterThan(200);
  });
});
