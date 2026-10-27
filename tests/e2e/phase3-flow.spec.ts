/**
 * tests/e2e/phase3-flow.spec.ts
 *
 * Phase 3 acceptance (§16) at 360×740 with the mock AI, driven through the UI:
 * 1. Buyer types "কাল মিরপুরে ৫০০টা ৭৫০ মিলি ঢাকনাওয়ালা কন্টেইনার লাগবে" → wizard prefilled
 *    (containers, 750 ml, lid, 500, tomorrow, Mirpur) with "material" asked as uncertain.
 * 2. Buyer picks the material and sends → 3 suppliers invited with reasons.
 * 3. Two suppliers quote from their own sessions (one late, one spec-different).
 * 4. Comparison shows the late warning and the spec difference; the server best fit for SPEED
 *    is never the late quote, and the AI panel never suggests it.
 * 5. Buyer confirms an order → the other quote is REJECTED.
 * 6. Supplier dispatches and delivers, buyer completes → feedback saved.
 * 7. "Only from previous supplier" re-order invites exactly one supplier.
 * Plus: AI failure (budget exhausted) opens the empty wizard.
 */

import { test, expect, type Page, type BrowserContext, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const screenshotDir = path.resolve(process.cwd(), "reports/screenshots");
const BASE = process.env.APP_URL || "http://localhost:3000";
const NEED_TEXT = "কাল মিরপুরে ৫০০টা ৭৫০ মিলি ঢাকনাওয়ালা কন্টেইনার লাগবে";

const dhakaDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date(Date.now() + offsetDays * 86400000));

async function clearRateLimits() {
  await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "otp:" } } });
}

async function newSession(
  browser: Browser,
  phone: string,
  lang: "bn" | "en" = "bn"
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await context.addCookies([{ name: "biznet_lang", value: lang, url: BASE }]);
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  await clearRateLimits();
  await page.goto("/login");
  await page.locator("input[type='tel']").fill(phone.replace("+880", ""));
  await page.locator("button[type='submit']").click();
  const otpInput = page.getByTestId("otp-input");
  await expect(otpInput).toBeVisible({ timeout: 10000 });
  const code = "123456";
  await prisma.otpCode.create({
    data: {
      phone,
      codeHash: crypto.createHash("sha256").update(code).digest("hex"),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });
  await otpInput.fill(code);
  await page.locator("button[type='submit']").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  return { context, page };
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(screenshotDir, name), fullPage: false });
}

async function makeUserWithBusiness(opts: { name: string; supplier: boolean; area: string; categoryId: string }) {
  const phone = `+88017${Math.floor(10000000 + Math.random() * 90000000)}`;
  const user = await prisma.user.create({ data: { name: opts.name, phone, phoneVerified: true, uiLanguage: "bn" } });
  const biz = await prisma.business.create({
    data: {
      name: opts.name,
      slug: `e2e-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      businessType: opts.supplier ? "MANUFACTURER" : "RESTAURANT",
      isBuyer: !opts.supplier,
      isSupplier: opts.supplier,
      area: opts.area,
      city: "Dhaka",
      addressLine: `${opts.area}, Dhaka`,
      phonePublic: opts.supplier ? "01700000999" : null,
      deliveryAreas: opts.supplier ? ["Mirpur", "Dhanmondi", "Uttara"] : [],
      verificationStatus: opts.supplier ? "VERIFIED" : "UNVERIFIED",
      verifiedAt: opts.supplier ? new Date() : null,
    },
  });
  await prisma.membership.create({ data: { businessId: biz.id, userId: user.id, role: "OWNER" } });
  await prisma.user.update({ where: { id: user.id }, data: { activeBusinessId: biz.id } });
  if (opts.supplier) {
    await prisma.supplierCategory.create({ data: { businessId: biz.id, categoryId: opts.categoryId } });
  }
  return { phone, user, biz };
}

async function submitQuote(
  page: Page,
  code: string,
  q: {
    unitPrice: string;
    charge: string;
    days: string;
    spec: Record<string, "MATCH" | "DIFFERENT">;
    offered?: Record<string, string>;
  },
  screenshot?: string
) {
  await page.goto(`/requests/${code}`);
  await page.locator("#open-quote-form-btn").click();
  await page.locator("#quote-unit-price-input").fill(q.unitPrice);
  await page.locator("#quote-delivery-charge-input").fill(q.charge);
  await page.locator("#quote-delivery-days-input").fill(q.days);
  for (const [field, status] of Object.entries(q.spec)) {
    await page.locator(`#spec-${field}-${status}`).click();
    if (status === "DIFFERENT") await page.locator(`#spec-offered-${field}`).fill(q.offered?.[field] ?? "");
  }
  if (screenshot) await shot(page, screenshot);
  await page.locator("#submit-quote-btn").click();
  await expect(page.locator("#my-quote-status")).toHaveAttribute("data-status", "SUBMITTED", { timeout: 10000 });
}

test.describe("Phase 3 acceptance: core loop at 360×740 (§16)", () => {
  let categoryId: string;
  let buyer: Awaited<ReturnType<typeof makeUserWithBusiness>>;
  let s1: Awaited<ReturnType<typeof makeUserWithBusiness>>;
  let s2: Awaited<ReturnType<typeof makeUserWithBusiness>>;
  let s3: Awaited<ReturnType<typeof makeUserWithBusiness>>;
  // Other containers suppliers (seed data, earlier runs) are paused during the test and restored afterwards
  let pausedSupplierIds: string[] = [];

  test.beforeAll(async () => {
    fs.mkdirSync(screenshotDir, { recursive: true });
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: "containers" } });
    categoryId = category.id;
    const others = await prisma.business.findMany({
      where: {
        isSupplier: true,
        isSuspended: false,
        OR: [
          { supplierCategories: { some: { categoryId } } },
          { listings: { some: { categoryId, isActive: true, deletedAt: null } } },
        ],
      },
      select: { id: true },
    });
    pausedSupplierIds = others.map((b) => b.id);
    await prisma.business.updateMany({ where: { id: { in: pausedSupplierIds } }, data: { isSuspended: true } });
    buyer = await makeUserWithBusiness({ name: "Dhaka Sweet & Bakery", supplier: false, area: "Mirpur", categoryId });
    s1 = await makeUserWithBusiness({ name: "Apex Containers Ltd", supplier: true, area: "Mirpur", categoryId });
    s2 = await makeUserWithBusiness({ name: "Modern Pack & Box", supplier: true, area: "Dhanmondi", categoryId });
    s3 = await makeUserWithBusiness({ name: "Bengal Plastics Packaging", supplier: true, area: "Uttara", categoryId });
  });

  test.afterAll(async () => {
    await prisma.business.updateMany({ where: { id: { in: pausedSupplierIds } }, data: { isSuspended: false } });
    // This run's suppliers must not affect later runs' matching
    await prisma.business.updateMany({ where: { id: { in: [s1, s2, s3].map((s) => s.biz.id) } }, data: { isSuspended: true } });
    await prisma.$disconnect();
  });

  test("need → AI spec → quotes → comparison → order → lifecycle → feedback → re-order", async ({ browser }) => {
    test.setTimeout(240000);

    // 1. Buyer describes the need in Bangla
    const { page: buyerPage } = await newSession(browser, buyer.phone);
    await buyerPage.goto("/requests/new");
    await expect(buyerPage.locator("#ai-need-text-input")).toBeVisible();
    await shot(buyerPage, "10-request-new-ai-bn.png");
    await buyerPage.locator("#ai-need-text-input").fill(NEED_TEXT);
    await buyerPage.locator("#continue-with-ai-btn").click();

    // 2. Wizard opens prefilled; material is asked as an uncertain field
    await expect(buyerPage.locator("#rfq-title-input")).not.toHaveValue("", { timeout: 15000 });
    await expect(buyerPage.locator("#category-tile-containers")).toHaveClass(/border-primary/);
    const materialChip = buyerPage.locator("#uncertain-option-material-plastic_pp");
    await expect(materialChip).toBeVisible();
    await shot(buyerPage, "11-request-wizard-bn.png");
    await materialChip.click();
    await buyerPage.locator("#rfq-next-step-1").click();
    await expect(buyerPage.locator("#rfq-quantity-input")).toHaveValue("500");
    await expect(buyerPage.locator("#needed-by-chip-tomorrow")).toHaveClass(/bg-primary/);
    await expect(buyerPage.locator("#rfq-delivery-area-select")).toHaveValue("Mirpur");
    await buyerPage.locator("#rfq-next-step-2").click();
    await buyerPage.locator("#send-request-submit-btn").click();
    await expect(buyerPage.locator("#created-request-code")).toBeVisible({ timeout: 15000 });
    await shot(buyerPage, "12-request-success-bn.png");

    const request = await prisma.request.findFirstOrThrow({
      where: { buyerBusinessId: buyer.biz.id },
      orderBy: { createdAt: "desc" },
      include: { invites: true, aiInteraction: true },
    });
    expect(request.attributes).toMatchObject({ capacity_ml: 750, has_lid: true, material: "plastic_pp" });
    expect(Number(request.quantity)).toBe(500);
    expect(request.deliveryArea).toBe("Mirpur");
    expect(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(request.neededBy!)).toBe(dhakaDate(1));
    expect(request.originalNeedText).toBe(NEED_TEXT);
    expect(request.aiInteraction?.outcome).toBe("EDITED"); // material was chosen by the buyer

    // 3 suppliers invited, each with stored reasons
    expect(request.invites.map((i) => i.supplierBusinessId).sort()).toEqual([s1.biz.id, s2.biz.id, s3.biz.id].sort());
    for (const invite of request.invites) expect((invite.reasons as unknown[]).length).toBeGreaterThan(0);

    // 3. Two suppliers quote from their own sessions: s1 on time & matching, s2 late & spec-different
    const { page: s1Page } = await newSession(browser, s1.phone);
    await submitQuote(
      s1Page,
      request.code,
      { unitPrice: "10", charge: "150", days: "1", spec: { material: "MATCH", capacity_ml: "MATCH", has_lid: "MATCH" } },
      "19-supplier-quote-form-bn.png"
    );
    const { page: s2Page } = await newSession(browser, s2.phone);
    await submitQuote(s2Page, request.code, {
      unitPrice: "8.5",
      charge: "200",
      days: "5",
      spec: { material: "DIFFERENT", capacity_ml: "MATCH", has_lid: "MATCH" },
      offered: { material: "paper" },
    });

    // 4. Comparison: late warning, spec difference, best fit never the late quote
    await buyerPage.goto(`/requests/${request.code}`);
    const s1Card = buyerPage.locator(`[data-supplier="${s1.biz.name}"]`);
    const s2Card = buyerPage.locator(`[data-supplier="${s2.biz.name}"]`);
    await expect(s1Card).toBeVisible({ timeout: 10000 });
    await expect(s2Card.locator("[id^='quote-late-warning-']")).toBeVisible();
    await expect(s2Card.locator("[data-spec-status='DIFFERENT']")).toBeVisible();
    await shot(buyerPage, "13-request-compare-table-bn.png");

    await buyerPage.locator("#comp-priority-SPEED").click();
    await expect(s1Card.locator("[id^='best-fit-badge-']")).toBeVisible();
    await expect(s2Card.locator("[id^='best-fit-badge-']")).toHaveCount(0);
    await buyerPage.locator("#compare-with-ai-btn").click();
    await expect(buyerPage.locator("#ai-panel")).toBeVisible({ timeout: 15000 });
    await expect(buyerPage.locator("#ai-label")).toBeVisible();
    if (await buyerPage.locator("#ai-best-fit").isVisible()) {
      await expect(buyerPage.locator("#ai-best-fit")).not.toContainText(s2.biz.name);
    }
    // The AI panel offers no way to order
    await expect(buyerPage.locator("#ai-panel [id^='choose-quote-btn-']")).toHaveCount(0);
    await shot(buyerPage, "13b-request-ai-compare-bn.png");

    // 5. Buyer chooses s1 and confirms on the sheet
    await s1Card.locator("[id^='choose-quote-btn-']").click();
    await expect(buyerPage.locator("#order-terms-final-notice")).toBeVisible();
    await shot(buyerPage, "14-order-confirm-sheet-bn.png");
    await buyerPage.locator("#confirm-order-action-btn").click();
    await buyerPage.waitForURL(/\/orders\/ORD-/, { timeout: 15000 });
    await expect(buyerPage.locator("#order-status-badge")).toHaveAttribute("data-status", "CONFIRMED");
    await shot(buyerPage, "15-order-detail-bn.png");

    const order = await prisma.order.findFirstOrThrow({ where: { requestId: request.id } });
    const s2Quote = await prisma.quote.findFirstOrThrow({
      where: { requestId: request.id, supplierBusinessId: s2.biz.id },
    });
    expect(s2Quote.status).toBe("REJECTED");

    // 6. Supplier dispatches and delivers; buyer completes
    await s1Page.goto(`/orders/${order.code}`);
    await s1Page.locator("#order-action-DISPATCHED").click();
    await expect(s1Page.locator("#order-status-badge")).toHaveAttribute("data-status", "DISPATCHED", { timeout: 10000 });
    await s1Page.locator("#order-action-DELIVERED").click();
    await expect(s1Page.locator("#order-status-badge")).toHaveAttribute("data-status", "DELIVERED", { timeout: 10000 });

    await buyerPage.reload();
    await buyerPage.locator("#order-action-COMPLETED").click();
    await expect(buyerPage.locator("#feedback-sheet")).toBeVisible({ timeout: 10000 });
    await buyerPage.locator("#fb-on-time-yes").click();
    await buyerPage.locator("#fb-quantity-yes").click();
    await buyerPage.locator("#fb-spec-yes").click();
    await shot(buyerPage, "16-order-feedback-sheet-bn.png");
    await buyerPage.locator("#fb-submit").click();
    await expect(buyerPage.locator("#feedback-saved")).toBeVisible({ timeout: 10000 });

    const feedback = await prisma.reliabilityFeedback.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(feedback).toMatchObject({ onTime: true, quantityCorrect: true, matchedSpec: true });
    const history = await prisma.orderStatusChange.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((h) => h.toStatus)).toEqual(["CONFIRMED", "DISPATCHED", "DELIVERED", "COMPLETED"]);

    // 7. Re-order only from the previous supplier → exactly one invite
    await buyerPage.locator("#order-again-btn").click();
    await shot(buyerPage, "17-order-reorder-modal-bn.png");
    await buyerPage.locator("#reorder-previous-supplier").click();
    await buyerPage.waitForURL(/\/requests\/REQ-/, { timeout: 15000 });
    const reorder = await prisma.request.findFirstOrThrow({
      where: { buyerBusinessId: buyer.biz.id, repeatOfRequestId: request.id },
      include: { invites: true },
    });
    expect(reorder.directSupplierId).toBe(s1.biz.id);
    expect(reorder.invites.map((i) => i.supplierBusinessId)).toEqual([s1.biz.id]);

    // English screenshot of the order page
    const { page: enPage } = await newSession(browser, buyer.phone, "en");
    await enPage.goto(`/orders/${order.code}`);
    await expect(enPage.locator("#order-status-badge")).toHaveAttribute("data-status", "COMPLETED");
    await shot(enPage, "18-order-detail-en.png");
  });

  test("AI failure (budget exhausted) opens the empty wizard", async ({ browser }) => {
    test.setTimeout(60000);
    await prisma.setting.upsert({
      where: { key: "aiDailyBudgetUsd" },
      create: { key: "aiDailyBudgetUsd", value: 0 },
      update: { value: 0 },
    });
    try {
      const { page } = await newSession(browser, buyer.phone);
      await page.goto("/requests/new");
      // Distinct text so no cached AI result can be reused
      await page.locator("#ai-need-text-input").fill(`ঢাকনাওয়ালা কন্টেইনার লাগবে ${Date.now()}`);
      await page.locator("#continue-with-ai-btn").click();
      await expect(page.locator("#rfq-title-input")).toBeVisible({ timeout: 15000 });
      await expect(page.locator("#rfq-title-input")).toHaveValue("");
      await expect(page.locator("#category-tile-containers")).not.toHaveClass(/border-primary/);
    } finally {
      await prisma.setting.delete({ where: { key: "aiDailyBudgetUsd" } }).catch(() => {});
    }
  });
});
