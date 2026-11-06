import { describe, it, expect } from "vitest";
import { detectFigures, NUMBER_RE, CURRENCY_RE, INCOTERM_RE } from "@/lib/translation/detector";
import { parseLocaleNumberToString, universalNormalizeDigits } from "@/lib/translation/localeParser";
import { shieldText, unshieldText } from "@/lib/translation/shield";

describe("Unicode Figure & Term Detector", () => {
  it("detects Western, Bengali, and Arabic numerals", () => {
    expect(detectFigures("I need 500 boxes")).toBe(true);
    expect(detectFigures("আমার ৫০০ কার্টন দরকার")).toBe(true);
    expect(detectFigures("أحتاج ٥٠٠ صندوق")).toBe(true);
  });

  it("does not false-positive on words like 'and 5' as currency codes", () => {
    // "and 5" should match number detector, but not false positive on currency
    expect(CURRENCY_RE.test("and 5")).toBe(false);
    expect(CURRENCY_RE.test("for 3 days")).toBe(false);
    expect(CURRENCY_RE.test("$100")).toBe(true);
    expect(CURRENCY_RE.test("100 BDT")).toBe(true);
    expect(CURRENCY_RE.test("500 EUR")).toBe(true);
  });

  it("strictly detects IncoTerms case-sensitively with word bounds", () => {
    expect(INCOTERM_RE.test("FOB Chittagong")).toBe(true);
    expect(INCOTERM_RE.test("CIF Dubai")).toBe(true);
    expect(INCOTERM_RE.test("MOQ is 1000")).toBe(true);
    expect(INCOTERM_RE.test("fob")).toBe(false); // lowercase ignored
    expect(INCOTERM_RE.test("comfortable")).toBe(false); // substring FOB in word ignored
  });
});

describe("Locale-Aware Number Parser", () => {
  it("normalizes international digit scripts to 0-9", () => {
    expect(universalNormalizeDigits("১৫০০")).toBe("1500");
    expect(universalNormalizeDigits("١٢٣")).toBe("123");
    expect(universalNormalizeDigits("۴۵")).toBe("45");
    expect(universalNormalizeDigits("१२")).toBe("12");
    expect(universalNormalizeDigits("৫০০")).toBe("500");
    expect(universalNormalizeDigits("٥٠٠")).toBe("500");
    expect(universalNormalizeDigits("५००")).toBe("500");
    expect(universalNormalizeDigits("۵۰۰")).toBe("500"); // Persian
  });

  it("parses US formatting correctly into decimal string", () => {
    expect(parseLocaleNumberToString("1,500.50", "en-US")).toBe("1500.50");
    expect(parseLocaleNumberToString("1500", "en-US")).toBe("1500");
  });

  it("parses German formatting correctly (comma decimal, period group)", () => {
    expect(parseLocaleNumberToString("1.500,50", "de-DE")).toBe("1500.50");
  });

  it("parses French formatting with narrow non-breaking space (U+202F)", () => {
    expect(parseLocaleNumberToString("1\u202F500,50", "fr-FR")).toBe("1500.50");
    expect(parseLocaleNumberToString("1 500,50", "fr-FR")).toBe("1500.50");
  });

  it("throws validation error on invalid input or corrupted text", () => {
    expect(() => parseLocaleNumberToString("abc", "en")).toThrow();
    expect(() => parseLocaleNumberToString("1.2.3", "en")).toThrow();
  });
});

describe("XML Tag Lexical Shield & Parity Validation", () => {
  it("shields numbers, currencies, and IncoTerms into tags", () => {
    const raw = "We offer 5,000 pcs @ $1.50/pc FOB Chittagong with MOQ 1000";
    const { shieldedText, tokens } = shieldText(raw);

    expect(shieldedText).toContain("<n id=");
    expect(shieldedText).toContain("<t id=");
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("restores shielded tokens accurately after mock translation", () => {
    const raw = "We offer 5,000 pcs @ $1.50/pc FOB Chittagong";
    const { shieldedText, tokens } = shieldText(raw);

    // Simulate translation where text around tags is translated into German
    const simulatedTranslation = shieldedText
      .replace("We offer", "Wir bieten")
      .replace("Chittagong", "Tschittagong");

    const result = unshieldText(simulatedTranslation, tokens);
    expect(result.success).toBe(true);
    expect(result.unshieldedText).toContain("5,000 pcs");
    expect(result.unshieldedText).toContain("$1.50/pc");
    expect(result.unshieldedText).toContain("FOB");
  });

  it("fails parity validation if a tag is dropped or duplicated, enabling caller fallback", () => {
    const raw = "500 pcs FOB";
    const { shieldedText, tokens } = shieldText(raw);

    // Simulate dropped tag
    const droppedOutput = shieldedText.replace(/<t id=".*?">.*?<\/t>/, "FOB");
    const result1 = unshieldText(droppedOutput, tokens);
    expect(result1.success).toBe(false);
    // When parity fails, caller falls back to original raw text
    const display1 = result1.success ? result1.unshieldedText : raw;
    expect(display1).toBe(raw);

    // Simulate duplicated tag
    const duplicatedOutput = shieldedText + " " + shieldedText;
    const result2 = unshieldText(duplicatedOutput, tokens);
    expect(result2.success).toBe(false);
    const display2 = result2.success ? result2.unshieldedText : raw;
    expect(display2).toBe(raw);
  });

  it("accurately shields and restores mixed-script trade text: 'MOQ ৫,০০০ pcs at $1.50'", () => {
    const raw = "MOQ ৫,০০০ pcs at $1.50";
    const { shieldedText, tokens } = shieldText(raw);

    expect(shieldedText).toContain("<t id=");
    expect(shieldedText).toContain("<n id=");

    // Simulate translation where 'at' is translated to 'par' or 'zu'
    const simulated = shieldedText.replace(" at ", " zu ");
    const result = unshieldText(simulated, tokens);

    expect(result.success).toBe(true);
    expect(result.unshieldedText).toContain("MOQ");
    expect(result.unshieldedText).toContain("৫,০০০ pcs");
    expect(result.unshieldedText).toContain("$1.50");
  });
});
