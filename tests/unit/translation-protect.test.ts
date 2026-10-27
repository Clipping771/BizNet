import { describe, it, expect, vi } from "vitest";
import { protectNumbers, restoreNumbers } from "@/lib/translation/protect";
import { DeepLTranslationProvider } from "@/lib/translation/provider";

describe("lib/translation/protect.ts — numbers are never machine-translated (§1, §11)", () => {
  it("masks Latin, Bangla and Arabic-Indic numbers with their units and money", () => {
    const { masked, tokens } = protectNumbers("৫০০টা ৭৫০ মিলি কন্টেইনার, ৳1,250.50 per box, 3 days, ٣٠ kg");
    expect(tokens).toEqual(["৫০০টা", "৭৫০ মিলি", "৳1,250.50", "3 days", "٣٠ kg"]);
    // Only the token indexes remain as digits
    expect(masked.replace(/\[\[\d+\]\]/g, "")).not.toMatch(/[0-9০-৯٠-٩]/);
  });

  it("does not swallow the start of a following word as a unit", () => {
    const { tokens, masked } = protectNumbers("5 mangoes and 2 large boxes");
    expect(tokens).toEqual(["5", "2"]);
    expect(masked).toBe("[[0]] mangoes and [[1]] large boxes");
  });

  it("restores the exact originals, and refuses a translation that lost or duplicated a number", () => {
    const { masked, tokens } = protectNumbers("Need 500 pcs by 28 Oct");
    expect(restoreNumbers(`[BN: ${masked}]`, tokens)).toBe("[BN: Need 500 pcs by 28 Oct]");
    expect(restoreNumbers("Need pcs by [[1]] Oct", tokens)).toBeNull();
    expect(restoreNumbers("[[0]] [[0]] [[1]]", tokens)).toBeNull();
    expect(restoreNumbers("[[0]] [[1]] [[2]]", tokens)).toBeNull();
  });
});

describe("DeepLTranslationProvider", () => {
  it("calls the free host for :fx keys and returns the translated text", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ translations: [{ text: "Hallo [[0]]" }] }), { status: 200 }));
    const provider = new DeepLTranslationProvider("abc:fx", fetchImpl as unknown as typeof fetch);
    const out = await provider.translate("Hello [[0]]", "en", "de");
    expect(out).toEqual({ text: "Hallo [[0]]", provider: "deepl" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-free.deepl.com/v2/translate");
    expect((init.headers as Record<string, string>).Authorization).toBe("DeepL-Auth-Key abc:fx");
    expect(JSON.parse(String(init.body))).toMatchObject({ target_lang: "DE", source_lang: "EN" });
  });

  it("throws on provider errors so the caller shows the original", async () => {
    const fetchImpl = vi.fn(async () => new Response("quota", { status: 456 }));
    await expect(new DeepLTranslationProvider("k", fetchImpl as unknown as typeof fetch).translate("x", "en", "bn")).rejects.toThrow(/456/);
  });
});
