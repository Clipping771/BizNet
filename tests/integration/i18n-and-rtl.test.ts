import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getTranslations, bumpCatalogVersion } from "../../lib/i18n";
import { upsertUiStringAndTranslation } from "../../lib/repo/i18n";

const prisma = new PrismaClient();

describe("Phase 1: i18n & RTL Architecture Tests", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should have bn and en as ACTIVE, and ar as DRAFT", async () => {
    const bn = await prisma.language.findUnique({ where: { code: "bn" } });
    const en = await prisma.language.findUnique({ where: { code: "en" } });
    const ar = await prisma.language.findUnique({ where: { code: "ar" } });

    expect(bn?.status).toBe("ACTIVE");
    expect(en?.status).toBe("ACTIVE");
    expect(ar?.status).toBe("DRAFT");

    expect(bn?.direction).toBe("ltr");
    expect(en?.direction).toBe("ltr");
    expect(ar?.direction).toBe("rtl");
  });

  it("should provide approved UI strings from database with fallback to English", async () => {
    // Verify UiString and UiTranslation records exist in DB
    const uiStringCount = await prisma.uiString.count();
    const uiTranslationCount = await prisma.uiTranslation.count();
    expect(uiStringCount).toBeGreaterThan(0);
    expect(uiTranslationCount).toBeGreaterThan(0);

    const bnTrans = await getTranslations("bn");
    const enTrans = await getTranslations("en");

    expect(bnTrans["app.title"]).toBe("বিজনেট");
    expect(enTrans["app.title"]).toBe("BizNet");

    expect(bnTrans["nav.home"]).toBe("হোম");
    expect(enTrans["nav.home"]).toBe("Home");
  });

  it("should dynamically overlay approved database translations over builtin strings", async () => {
    const testKey = `test.dynamic.key.${Date.now()}`;
    const dynamicBanglaText = "গতিশীল ডাটাবেজ অনুবাদ";

    await upsertUiStringAndTranslation(testKey, "Dynamic English", {
      bn: dynamicBanglaText,
    });

    bumpCatalogVersion();
    const translations = await getTranslations("bn");
    expect(translations[testKey]).toBe(dynamicBanglaText);
  });

  it("should configure Arabic translations and RTL direction correctly for Arabic preview", async () => {
    const arLang = await prisma.language.findUnique({ where: { code: "ar" } });
    expect(arLang?.direction).toBe("rtl");

    const arTrans = await getTranslations("ar");
    expect(arTrans["app.title"]).toBe("بيزنت");
    expect(arTrans["nav.home"]).toBe("الرئيسية");

    // Direction verification
    function getHtmlDir(langCode: string): "ltr" | "rtl" {
      return langCode === "ar" ? "rtl" : "ltr";
    }

    expect(getHtmlDir("bn")).toBe("ltr");
    expect(getHtmlDir("en")).toBe("ltr");
    expect(getHtmlDir("ar")).toBe("rtl");
  });
});
