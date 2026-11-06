/**
 * lib/translation/shield.ts
 *
 * XML Tag Lexical Shield for Machine Translation.
 * Uses DeepL xml-tag handling compatible tags (<n id="..."> and <t id="...">)
 * to preserve grammar in morphologically rich languages while guaranteeing
 * strict 3-point parity:
 * 1. Completeness: all tag IDs present
 * 2. Uniqueness: no tag ID duplicated
 * 3. Invariance: contents within tags are 100% preserved
 */

import { INCOTERM_RE } from "./detector";

export interface TagToken {
  id: number;
  type: "number" | "term";
  raw: string;
}

export interface ShieldResult {
  shieldedText: string;
  tokens: TagToken[];
}

export interface UnshieldResult {
  success: boolean;
  unshieldedText: string;
  error?: string;
}

// Regex to capture numbers with optional attached currency and units
const SHIELD_NUMBER_RE = /(?:[$€£¥৳₹元]\s*)?\p{Nd}+(?:[.,\u00A0\u202F]\p{Nd}+)*(?:\s*(?:\/|\s)?(?:pcs|pc|kg|g|gm|tonne|tons?|meter|m|cm|mm|ml|l|ltr|gsm|%|tk|bdt|usd|eur|cny|aed|inr))?/giu;

/**
 * Wraps numbers and contractual trade terms into XML tags.
 * Numbers are shielded first to avoid matching numeric IDs inside tag attributes.
 */
export function shieldText(text: string): ShieldResult {
  if (!text) return { shieldedText: "", tokens: [] };

  const tokens: TagToken[] = [];
  let tokenCounter = 0;

  // 1. Shield Numbers first (<n id="...">) on clean raw text
  let processed = text.replace(SHIELD_NUMBER_RE, (match) => {
    const id = tokenCounter++;
    tokens.push({ id, type: "number", raw: match });
    return `<n id="${id}">${match}</n>`;
  });

  // 2. Shield IncoTerms (<t id="...">), ensuring we never match inside XML tag definitions
  processed = processed.replace(new RegExp(INCOTERM_RE.source, "g"), (match, offset, fullString) => {
    const before = fullString.slice(0, offset);
    const lastOpen = before.lastIndexOf("<");
    const lastClose = before.lastIndexOf(">");
    if (lastOpen > lastClose) {
      return match; // inside tag definition, skip
    }

    const id = tokenCounter++;
    tokens.push({ id, type: "term", raw: match });
    return `<t id="${id}">${match}</t>`;
  });

  return { shieldedText: processed, tokens };
}

/**
 * Performs strict 3-point parity validation and unshields translated text.
 * Returns { success: false, unshieldedText: originalText } if tags were dropped, mutated, or duplicated.
 */
export function unshieldText(translatedShieldedText: string, expectedTokens: TagToken[]): UnshieldResult {
  if (!translatedShieldedText) {
    return { success: false, unshieldedText: "", error: "Empty translation output" };
  }

  // 1. Check completeness and uniqueness: each specific tag <n id="X">...</n> must match exactly once
  for (const token of expectedTokens) {
    const tagPattern = token.type === "number"
      ? new RegExp(`<n id="${token.id}">([\\s\\S]*?)</n>`, "g")
      : new RegExp(`<t id="${token.id}">([\\s\\S]*?)</t>`, "g");

    const matches = [...translatedShieldedText.matchAll(tagPattern)];
    if (matches.length !== 1) {
      return {
        success: false,
        unshieldedText: translatedShieldedText,
        error: `Parity failed for token id=${token.id} (matched ${matches.length} times, expected 1)`
      };
    }
  }

  // 2. Unshield and restore exact original values using replacement function
  // Replacer function avoids JS string.replace treating "$" in token.raw as special backreference
  let restored = translatedShieldedText;
  for (const token of expectedTokens) {
    const tagRegex = token.type === "number"
      ? new RegExp(`<n id="${token.id}">[\\s\\S]*?</n>`, "g")
      : new RegExp(`<t id="${token.id}">[\\s\\S]*?</t>`, "g");

    restored = restored.replace(tagRegex, () => token.raw);
  }

  // Ensure no rogue orphan tags remain
  if (/<[nt] id="\d+">|<\/[nt]>/.test(restored)) {
    return {
      success: false,
      unshieldedText: restored,
      error: "Rogue or orphan XML tags detected in output"
    };
  }

  return { success: true, unshieldedText: restored };
}
