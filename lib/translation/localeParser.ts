/**
 * lib/translation/localeParser.ts
 *
 * Locale-aware international number parser.
 * Converts Unicode numerals (Arabic, Bengali, Devanagari, Persian, etc.) to ASCII 0-9
 * and normalizes locale formatting (handling French U+202F, comma/period decimals).
 * Strictly returns a Decimal String, NEVER a floating point number.
 */

// Starting codepoints of the standard 10-digit decimal blocks (0-9) in Unicode
export const DIGIT_ZEROS = [
  0x0030, // ASCII Latin (0-9)
  0x0660, // Arabic-Indic (٠-٩)
  0x06F0, // Extended Arabic-Indic / Persian / Urdu (۰-۹)
  0x07C0, // N'Ko (߀-߉)
  0x0966, // Devanagari / Hindi / Marathi (०-९)
  0x09E6, // Bengali / Assamese (০-৯)
  0x0A66, // Gurmukhi / Punjabi (੦-੯)
  0x0AE6, // Gujarati (૦-૯)
  0x0B66, // Oriya (୦-୯)
  0x0BE6, // Tamil (௦-௯)
  0x0C66, // Telugu (౦-౯)
  0x0CE6, // Kannada (೦-೯)
  0x0D66, // Malayalam (൦-൯)
  0x0E50, // Thai (๐-๙)
  0x0ED0, // Lao (໐-໙)
  0x0F20, // Tibetan (༠-༩)
  0x1040, // Myanmar (၀-၉)
  0x17E0, // Khmer (០-៩)
  0x1810, // Mongolian (᠐-᠙)
  0xFF10, // Fullwidth (０-９)
];

/**
 * Universal Unicode digit normalizer that maps any \p{Nd} character to standard 0-9
 * using Unicode decimal digit block zero subtraction.
 * Throws an explicit Error if an unsupported or unrecognized Unicode digit is encountered.
 */
export function universalNormalizeDigits(str: string): string {
  if (!str) return "";
  return str.replace(/\p{Nd}/gu, (char) => {
    const code = char.codePointAt(0);
    if (!code) return char;
    
    const zero = DIGIT_ZEROS.find((z) => code >= z && code <= z + 9);
    if (zero === undefined) {
      throw new Error(`Unsupported or unmapped Unicode digit: "${char}" (U+${code.toString(16).toUpperCase()})`);
    }
    return String(code - zero);
  });
}

/**
 * Parses an internationally formatted numeric string into a standardized Decimal string (e.g. "1500.50").
 * Throws an Error if parsing results in an invalid number.
 */
export function parseLocaleNumberToString(rawInput: string, locale: string = "en"): string {
  if (!rawInput || typeof rawInput !== "string") {
    throw new Error("Invalid input: empty or non-string provided");
  }

  const normalized = universalNormalizeDigits(rawInput.trim());

  // Extract locale decimal and group separators
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const groupChar = parts.find((d) => d.type === "group")?.value || ",";
  const decimalChar = parts.find((d) => d.type === "decimal")?.value || ".";

  // Escape regex characters
  const escapedGroup = groupChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const groupPattern = new RegExp(`[${escapedGroup}\\s\\u00A0\\u202F]`, "g");

  const stripped = normalized.replace(groupPattern, "");
  const result = decimalChar !== "." ? stripped.replace(decimalChar, ".") : stripped;

  // Strict validation: must match valid optional negative sign, digits, and optional decimal point with digits
  if (!/^-?\d+(\.\d+)?$/.test(result)) {
    throw new Error(`Invalid numeric input: "${rawInput}" parsed to invalid format "${result}"`);
  }

  return result;
}
