import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient();
const BASE = process.env.APP_URL || "http://localhost:3000";

const randomBdPhone = () => `+88018${Math.floor(10000000 + Math.random() * 90000000)}`;

async function loginWithPhone(page: Page, fullPhone: string) {
  await page.goto("/login");
  await page.locator("input[type='tel']").fill(fullPhone.replace("+880", ""));
  await page.locator("button[type='submit']").click();

  const otpInput = page.getByTestId("otp-input");
  await expect(otpInput).toBeVisible({ timeout: 10000 });

  // The SMS provider is a console stub, so plant a known code for this phone.
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

async function createBusiness(page: Page, roleIndex: 0 | 1, name: string) {
  await page.goto("/onboarding");
  await page.locator("form button[type='button']").nth(roleIndex).click();
  await page.getByPlaceholder("e.g. Apex Packaging / Global Trade Co.").fill(name);
  await page.getByPlaceholder("Road / Shop / House").fill("House 1, Road 2");
  await page.locator("form button[type='submit']").click();
  await page.waitForURL(/\/home/, { timeout: 15000 });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("Phase 1 acceptance flow at 360x740 (§16)", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("buyer + supplier businesses, STAFF invite, switch business, ar RTL admin-only", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await context.addCookies([{ name: "biznet_lang", value: "en", url: BASE }]);

    const phone = randomBdPhone();
    const suffix = crypto.randomBytes(3).toString("hex");
    const buyerName = `E2E Buyer ${suffix}`;
    const supplierName = `E2E Supplier ${suffix}`;

    // 1. Login
    await loginWithPhone(page, phone);

    // 2. Create a buyer and a supplier business
    await createBusiness(page, 0, buyerName);
    await expectNoHorizontalOverflow(page);
    await createBusiness(page, 1, supplierName);

    const user = await prisma.user.findFirstOrThrow({ where: { phone } });
    const businesses = await prisma.business.findMany({
      where: { members: { some: { userId: user.id } } },
      select: { name: true, isBuyer: true, isSupplier: true },
    });
    expect(businesses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: buyerName, isBuyer: true }),
        expect.objectContaining({ name: supplierName, isSupplier: true }),
      ])
    );

    // 3. Invite a STAFF member from the members page
    const staffPhone = randomBdPhone();
    await page.goto("/business/members");
    await page.getByPlaceholder("+8801... / user@company.com").fill(staffPhone);
    await page.locator("select").selectOption("STAFF");
    await page.getByRole("button", { name: "Send Invitation" }).click();
    await expect(page.getByText(staffPhone)).toBeVisible({ timeout: 10000 });
    await expectNoHorizontalOverflow(page);

    const invite = await prisma.memberInvite.findFirst({ where: { phone: staffPhone } });
    expect(invite?.role).toBe("STAFF");

    // 4. Switch the active business back to the buyer
    await page.goto("/account");
    const buyerRow = page.locator("div.py-2\\.5").filter({ hasText: buyerName });
    await buyerRow.getByRole("button", { name: "Switch Business" }).click();
    await expect(buyerRow.getByRole("button", { name: "Switch Business" })).toHaveCount(0, {
      timeout: 15000,
    });
    await expect(page.locator("header")).toContainText(buyerName);

    // 5. Arabic (DRAFT) is admin-only: a regular user stays on LTR English
    await context.addCookies([{ name: "biznet_lang", value: "ar", url: BASE }]);
    await page.goto("/home");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).not.toHaveAttribute("lang", "ar");

    // ...while an ADMIN gets the RTL preview without layout breakage at 360px
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    await page.goto("/home");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expectNoHorizontalOverflow(page);
    await page.goto("/business/members");
    await expectNoHorizontalOverflow(page);
  });
});
