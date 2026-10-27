/**
 * Numbers, units and money are never machine-translated (§1, §11). Before translation every
 * number (Latin, Bangla or Arabic-Indic digits, with separators, currency and a following unit)
 * is replaced by a numbered token; after translation the exact original text is put back. If a
 * provider drops or duplicates a token, the caller must show the original instead.
 */

const UNIT = "(?:\\s?(?:টাকা|tk|taka|bdt|৳|pcs|pc|পিস|টা|টি|কেজি|kg|g|gm|গ্রাম|ml|মিলি|l|ltr|লিটার|cm|mm|m|মিটার|inch|ইঞ্চি|gsm|%|দিন|days?|ঘণ্টা|hours?)(?![\\p{L}\\p{M}]))?";
const NUMBER = new RegExp(`(?:৳\\s?)?[0-9০-৯٠-٩]+(?:[.,][0-9০-৯٠-٩]+)*${UNIT}`, "giu");

export interface Protected {
  masked: string;
  tokens: string[];
}

const token = (i: number) => `[[${i}]]`;

export function protectNumbers(text: string): Protected {
  const tokens: string[] = [];
  const masked = text.replace(NUMBER, (match) => {
    tokens.push(match);
    return token(tokens.length - 1);
  });
  return { masked, tokens };
}

/** Puts the original numbers back; returns null when any token is missing or repeated. */
export function restoreNumbers(translated: string, tokens: string[]): string | null {
  for (let i = 0; i < tokens.length; i++) {
    const occurrences = translated.split(token(i)).length - 1;
    if (occurrences !== 1) return null;
  }
  let out = translated;
  tokens.forEach((original, i) => {
    out = out.replace(token(i), original);
  });
  return /\[\[\d+\]\]/.test(out) ? null : out;
}
