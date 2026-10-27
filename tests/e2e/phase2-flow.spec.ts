import { test, expect, type Page } from "@playwright/test";
import { PrismaClient, PlatformRole, VerificationStatus } from "@prisma/client";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const BASE = process.env.APP_URL || "http://localhost:3000";

const randomBdPhone = () => `+88018${Math.floor(10000000 + Math.random() * 90000000)}`;

async function loginWithPhone(page: Page, fullPhone: string) {
  await prisma.rateLimitBucket.deleteMany({
    where: {
      key: {
        in: [
          `otp:phone:${fullPhone}`,
          `otp:verify:phone:${fullPhone}`,
          "otp:ip:::1",
          "otp:verify:ip:::1",
          "otp:ip:127.0.0.1",
          "otp:verify:ip:127.0.0.1",
          "otp:ip:unknown-proxy-client",
          "otp:verify:ip:unknown-proxy-client",
        ],
      },
    },
  });

  await page.goto("/login");
  await page.locator("input[type='tel']").fill(fullPhone.replace("+880", ""));
  await page.locator("button[type='submit']").click();

  const otpInput = page.getByTestId("otp-input");
  await expect(otpInput).toBeVisible({ timeout: 10000 });

  const code = "123456";
  await prisma.otpCode.create({
    data: {
      phone: fullPhone,
      codeHash: crypto.createHash("sha256").update(code).digest("hex"),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });
  await otpInput.fill(code);
  await page.locator("button[type='submit']").click();
  await page.waitForURL(/\/(onboarding|home)/, { timeout: 15000 });
}

async function createSupplierBusiness(page: Page, name: string) {
  await page.goto("/onboarding");
  // Click supplier role button (index 1)
  await page.locator("form button[type='button']").nth(1).click();
  await page.getByPlaceholder("e.g. Apex Packaging / Global Trade Co.").fill(name);
  await page.getByPlaceholder("Road / Shop / House").fill("Shop 14, Chawkbazar Main Road");
  await page.locator("form button[type='submit']").click();
  await page.waitForURL(/\/home/, { timeout: 15000 });
}

test.describe("Phase 2 Acceptance: Supply Side Flow 360x740 (§16)", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  const screenshotsDir = path.join(process.cwd(), "reports", "screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  test.beforeEach(async () => {
    // Reset rate limits for test IP to avoid 429 during automated E2E runs
    await prisma.rateLimitBucket.deleteMany({
      where: {
        key: {
          in: [
            "otp:ip:::1",
            "otp:verify:ip:::1",
            "otp:ip:127.0.0.1",
            "otp:verify:ip:127.0.0.1",
            "otp:ip:unknown-proxy-client",
            "otp:verify:ip:unknown-proxy-client",
          ],
        },
      },
    });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("supplier verification → admin approves BASIC with minutes → supplier creates 3 listings → public pages verify", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180000);

    // 1. Setup Supplier User
    const supplierPhone = randomBdPhone();
    const suffix = crypto.randomBytes(3).toString("hex");
    const supplierBizName = `Apex Pack ${suffix}`;

    await loginWithPhone(page, supplierPhone);
    await createSupplierBusiness(page, supplierBizName);

    const supplierBiz = await prisma.business.findFirstOrThrow({
      where: { name: supplierBizName },
    });

    // 2. Supplier requests verification at /business/verification
    await page.goto("/business/verification");
    await expect(page.locator("h1")).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, "01-verification-form-bn.png") });

    // Fill verification details
    const licenseInput = page.locator("input").nth(0);
    await licenseInput.fill(`TRAD-${suffix.toUpperCase()}-2026`);

    const refNameInput = page.locator("input").nth(1);
    await refNameInput.fill("Kamal Packaging Traders");

    const refPhoneInput = page.locator("input").nth(2);
    await refPhoneInput.fill("+8801712345678");

    // Submit verification
    const submitBtn = page.locator("button[type='submit']");
    await submitBtn.click();

    // Verify status updated to pending or success message shown
    await expect(
      page.locator("text=সফলভাবে").or(page.locator("text=প্রক্রিয়াধীন")).or(page.locator("text=Pending")).first()
    ).toBeVisible({ timeout: 10000 });

    // 3. Admin logs in and reviews verification in /admin/verifications
    const adminPhone = randomBdPhone();
    await prisma.user.create({
      data: {
        phone: adminPhone,
        name: "Super Admin",
        role: PlatformRole.ADMIN,
        phoneVerified: true,
      },
    });

    const adminContext = await browser.newContext({ viewport: { width: 360, height: 740 } });
    const adminPage = await adminContext.newPage();
    await loginWithPhone(adminPage, adminPhone);

    await adminPage.goto("/admin/verifications");
    await expect(adminPage.locator("h1")).toBeVisible();
    await adminPage.screenshot({ path: path.join(screenshotsDir, "02-admin-verifications-bn.png") });

    // Locate the supplier's request card using data-testid
    const requestCard = adminPage.locator(`[data-testid='verification-card-${supplierBiz.id}']`);
    await expect(requestCard).toBeVisible({ timeout: 10000 });

    // Check checklist items
    const checkboxes = requestCard.locator("input[type='checkbox']");
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    // Enter required minutes spent
    const minutesInput = requestCard.locator("input[type='number']");
    await minutesInput.fill("15");

    // Enter review note
    const noteArea = requestCard.locator("textarea");
    if (await noteArea.count() > 0) {
      await noteArea.fill("Checked phone and physical location.");
    }

    // Approve BASIC
    const approveBasicBtn = requestCard.locator("button:has-text('BASIC')").first();
    await approveBasicBtn.click();

    // Wait for business verification status in database
    await expect.poll(async () => {
      const b = await prisma.business.findUnique({ where: { id: supplierBiz.id } });
      return b?.verificationStatus;
    }, { timeout: 10000 }).toBe(VerificationStatus.BASIC);

    // Visit /admin/ops-time and capture screenshot (§17, E1)
    await adminPage.goto("/admin/ops-time");
    await expect(adminPage.locator("h1")).toBeVisible();
    await adminPage.screenshot({ path: path.join(screenshotsDir, "08-admin-ops-time-bn.png") });

    await adminContext.close();

    // 4. Supplier navigates to /business/listings and creates 3 listings
    await page.goto("/business/listings");
    await page.screenshot({ path: path.join(screenshotsDir, "03-business-listings-bn.png") });

    const newListingBtn = page.locator("a:has-text('নতুন'), a:has-text('New')").first();
    await expect(newListingBtn).toBeVisible({ timeout: 10000 });

    const containersCat = await prisma.category.findUniqueOrThrow({ where: { slug: "containers" } });
    const foodBoxesCat = await prisma.category.findUniqueOrThrow({ where: { slug: "food_boxes" } });
    const carryBagsCat = await prisma.category.findUniqueOrThrow({ where: { slug: "carry_bags" } });

    // Listing 1: Containers
    await page.goto("/business/listings/new");
    await page.screenshot({ path: path.join(screenshotsDir, "04-listing-new-bn.png") });

    await page.locator("select").first().selectOption(containersCat.id);
    await page.locator("input[type='text']").nth(0).fill("500ml Microwave Food Container");
    // Attribute select: material (required for containers)
    const containerSelects = page.locator("select");
    if (await containerSelects.count() > 1) {
      await containerSelects.nth(1).selectOption("plastic_pp");
    }
    // Radio buttons for has_lid and microwave_safe
    const yesRadios = page.locator("input[type='radio'][value='true']");
    if (await yesRadios.count() > 0) {
      await yesRadios.first().check();
    }
    await page.locator("button[type='submit']").click();
    await page.waitForURL(/\/business\/listings$/, { timeout: 15000 });

    // Listing 2: Food Boxes
    await page.goto("/business/listings/new");
    await page.locator("select").first().selectOption(foodBoxesCat.id);
    await page.locator("input[type='text']").nth(0).fill("3-Compartment Meal Box Kraft");
    const foodBoxSelects = page.locator("select");
    if (await foodBoxSelects.count() > 1) {
      await foodBoxSelects.nth(1).selectOption("kraft");
    }
    await page.locator("button[type='submit']").click();
    await page.waitForURL(/\/business\/listings$/, { timeout: 15000 });

    // Listing 3: Carry Bags
    await page.goto("/business/listings/new");
    await page.locator("select").first().selectOption(carryBagsCat.id);
    await page.locator("input[type='text']").nth(0).fill("Brown Kraft Paper Bag with Handle");
    const carryBagSelects = page.locator("select");
    if (await carryBagSelects.count() > 1) {
      await carryBagSelects.nth(1).selectOption("paper");
    }
    await page.locator("button[type='submit']").click();
    await page.waitForURL(/\/business\/listings$/, { timeout: 15000 });

    // 5. Verify the 3 listings exist in database
    const createdListings = await prisma.listing.findMany({
      where: { businessId: supplierBiz.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(createdListings.length).toBe(3);

    const firstListingId = createdListings[0].id;
    await page.goto(`/business/listings/${firstListingId}/edit`);
    await expect(page.locator("h1")).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, "09-listing-edit-bn.png") });

    // 6. Public User (logged out) visits /b/[slug]
    const publicContext = await browser.newContext({ viewport: { width: 360, height: 740 } });
    const publicPage = await publicContext.newPage();

    await publicPage.goto(`/b/${supplierBiz.slug}`);
    await expect(publicPage.locator("h1")).toContainText(supplierBizName);
    await publicPage.screenshot({ path: path.join(screenshotsDir, "05-public-business-bn.png") });

    // Check verification badge
    const badge = publicPage.locator("text=Identity verified (basic)").or(publicPage.locator("text=পরিচয় যাচাইকৃত (বেসিক)"));
    await expect(badge).toBeVisible();

    // Verify phone number is NEVER shown (§7, D1)
    await expect(publicPage.locator(`text=${supplierPhone}`)).not.toBeVisible();

    // Verify all 3 listings are displayed on the public profile
    await expect(publicPage.locator("text=500ml Microwave Food Container")).toBeVisible();
    await expect(publicPage.locator("text=3-Compartment Meal Box Kraft")).toBeVisible();
    await expect(publicPage.locator("text=Brown Kraft Paper Bag with Handle")).toBeVisible();

    // 7. Public User visits /l/[id]
    await publicPage.goto(`/l/${firstListingId}`);
    await expect(publicPage.locator("h1")).toBeVisible();
    await publicPage.screenshot({ path: path.join(screenshotsDir, "06-public-listing-bn.png") });

    // English screenshot capture for delivery requirement (§16)
    await publicContext.addCookies([{ name: "biznet_lang", value: "en", url: BASE }]);
    await publicPage.goto(`/l/${firstListingId}`);
    await publicPage.screenshot({ path: path.join(screenshotsDir, "07-public-listing-en.png") });

    await publicContext.close();
  });

  test("separate: unverified supplier is blocked from creating listings on UI and direct API", async ({
    page,
    request,
  }) => {
    const unverifiedPhone = randomBdPhone();
    await loginWithPhone(page, unverifiedPhone);
    const unverifiedBizName = `Unverified Biz ${Date.now()}`;
    await createSupplierBusiness(page, unverifiedBizName);

    // 1. Visit /business/listings - verify blocked banner is visible
    await page.goto("/business/listings");
    await expect(page.locator("a:has-text('নতুন'), a:has-text('New')")).not.toBeVisible();
    await expect(page.locator("a[href='/business/verification']")).toBeVisible();

    // 2. Direct API call to POST /api/business/listings is blocked with 403
    const category = await prisma.category.findFirstOrThrow();
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const apiRes = await request.post(`${BASE}/api/business/listings`, {
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      data: {
        categoryId: category.id,
        title: "Unauthorized Listing Attempt",
        unit: "pcs",
        attributes: {},
      },
    });

    expect(apiRes.status()).toBe(403);
    const body = await apiRes.json();
    expect(body.error).toContain("BASIC or VERIFIED");
  });

  test("separate: private documents are unreachable without admin signed URL", async ({
    page,
    request,
    browser,
  }) => {
    // 1. Non-logged-in user accessing /api/files/[key] -> 401
    const unauthRes = await request.get(`${BASE}/api/files/private/verification/test-doc.pdf`);
    expect(unauthRes.status()).toBe(401);

    // 2. Supplier business owner accessing private document -> 403 (spec: admin-only)
    const supplierPhone = randomBdPhone();
    await loginWithPhone(page, supplierPhone);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const ownerRes = await request.get(`${BASE}/api/files/private/verification/test-doc.pdf`, {
      headers: { Cookie: cookieHeader },
    });
    expect(ownerRes.status()).toBe(403);
    const ownerBody = await ownerRes.json();
    expect(ownerBody.error).toContain("admin-only");

    // 3. Admin user accessing private document -> 200 with signed URL
    const adminPhone = randomBdPhone();
    await prisma.user.create({
      data: {
        phone: adminPhone,
        name: "Admin Reviewer",
        role: PlatformRole.ADMIN,
        phoneVerified: true,
      },
    });
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginWithPhone(adminPage, adminPhone);
    const adminCookies = await adminContext.cookies();
    const adminCookieHeader = adminCookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const adminRes = await request.get(`${BASE}/api/files/private/verification/test-doc.pdf`, {
      headers: { Cookie: adminCookieHeader },
    });
    expect(adminRes.status()).toBe(200);
    const adminBody = await adminRes.json();
    expect(adminBody.url).toBeDefined();
    expect(adminBody.expiresIn).toBe(300);

    // 4. An expired signed download token returns 403
    const expiredTimestamp = Date.now() - 10000;
    const fakeSig = crypto.randomBytes(32).toString("hex");
    const downloadRes = await request.get(
      `${BASE}/api/files/download?key=private/verification/test-doc.pdf&expires=${expiredTimestamp}&sig=${fakeSig}`
    );
    expect(downloadRes.status()).toBe(403);

    await adminContext.close();
  });
});
