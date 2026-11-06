/**
 * lib/translation/detector.ts
 *
 * Strict Unicode Figure, Currency, and IncoTerm Detection.
 * Decoupled to avoid ASCII \b regex flaws and case-insensitive 3-letter false positives.
 */

// 1. Unicode digits across Western, Arabic, Bengali, Devanagari, etc.
// Omit raw whitespace \s so "5 10" is not treated as a single composite number.
export const NUMBER_RE = /\p{Nd}+(?:[.,\u00A0\u202F]\p{Nd}+)*/u;

// 2. Currency symbols and explicit ISO currency codes
export const CURRENCY_RE = /[$€£¥৳₹元]|\b(?:USD|EUR|BDT|CNY|AED|INR|AUD|GBP)\b/;

// 3. Strict case-sensitive B2B trade terms (IncoTerms + MOQ) with negative lookaround
export const INCOTERM_RE = /(?<![A-Za-z])(?:MOQ|FOB|CIF|EXW|DDP|CFR|FCA|CIP|DAP|DPU)(?![A-Za-z])/;

/**
 * Checks whether text contains figures, currency, or contractual trade terms that require
 * a warning alert and strict number preservation checks.
 */
export function detectFigures(text: string): boolean {
  if (!text) return false;
  return NUMBER_RE.test(text) || CURRENCY_RE.test(text) || INCOTERM_RE.test(text);
}
