import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient();

test.describe("Phase 1 Mobile First 360x740 E2E Authentication Flow", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("loads login page at 360x740, verifies multi-method tabs, and completes dev phone login", async ({
    page,
  }) => {
    // 1. Visit Login Page
    await page.goto("/login");
    await expect(page).toHaveTitle(/BizNet/);

    // 2. Verify Viewport Dimensions
    const size = page.viewportSize();
    expect(size?.width).toBe(360);
    expect(size?.height).toBe(740);

    // 3. Check Multi-Method Buttons (Phone, Email, Passkey)
    const phoneTab = page.getByTestId("tab-phone");
    const emailTab = page.getByTestId("tab-email");
    const passkeyTab = page.getByTestId("tab-passkey");

    await expect(phoneTab).toBeVisible();
    await expect(emailTab).toBeVisible();
    await expect(passkeyTab).toBeVisible();

    // 4. Fill in unique BD Phone Number (+88018XXXXXXXX)
    const random8 = Math.floor(10000000 + Math.random() * 90000000);
    const phoneInputVal = `18${random8}`;
    const fullPhone = `+880${phoneInputVal}`;
    const phoneInput = page.locator("input[type='tel']");
    await expect(phoneInput).toBeVisible();
    await phoneInput.fill(phoneInputVal);

    // 5. Submit Phone Form
    const sendOtpBtn = page.locator("button[type='submit']");
    await sendOtpBtn.click();

    // 6. OTP Input Step
    const otpInput = page.getByTestId("otp-input");
    await expect(otpInput).toBeVisible({ timeout: 10000 });

    // 7. Inject verified OTP code into DB for test verification to work seamlessly
    const testCode = "123456";
    const codeHash = crypto.createHash("sha256").update(testCode).digest("hex");
    await prisma.otpCode.create({
      data: {
        phone: fullPhone,
        codeHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0,
      },
    });

    // 8. Fill in 123456 OTP code
    await otpInput.fill(testCode);

    // 9. Verify OTP
    const verifyBtn = page.locator("button[type='submit']");
    await verifyBtn.click();

    // 10. Redirects to onboarding or home
    await page.waitForURL(/\/(onboarding|home)/, { timeout: 10000 });
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/(onboarding|home)/);
  });

  test("switches between auth tabs cleanly without layout breakage", async ({ page }) => {
    await page.goto("/login");

    // Switch to Email tab
    const emailTab = page.getByTestId("tab-email");
    await emailTab.click();
    const emailInput = page.locator("input[type='email']");
    await expect(emailInput).toBeVisible();

    // Switch to Passkey tab
    const passkeyTab = page.getByTestId("tab-passkey");
    await passkeyTab.click();
    const passkeyBtn = page.locator("button:has-text('Passkey'), button:has-text('পাসকি')").last();
    await expect(passkeyBtn).toBeVisible();

    // Switch back to Phone tab
    const phoneTab = page.getByTestId("tab-phone");
    await phoneTab.click();
    const phoneInput = page.locator("input[type='tel']");
    await expect(phoneInput).toBeVisible();
  });
});
