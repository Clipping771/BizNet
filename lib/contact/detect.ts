/**
 * lib/contact/detect.ts
 *
 * Contact bypass filter (§8.12, F14/F15, I2)
 * Pure function: detectContactBypass
 */

export interface ContactDetectResult {
  hasContact: boolean;
  pattern?: string;
  reason?: string;
}

const BANGLA_DIGITS: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

export function normalizeDigits(text: string): string {
  let result = "";
  for (const char of text) {
    if (BANGLA_DIGITS[char] !== undefined) {
      result += BANGLA_DIGITS[char];
    } else if (ARABIC_INDIC_DIGITS[char] !== undefined) {
      result += ARABIC_INDIC_DIGITS[char];
    } else {
      result += char;
    }
  }
  return result;
}

export function detectContactBypass(rawText: string): ContactDetectResult {
  if (!rawText || !rawText.trim()) {
    return { hasContact: false };
  }

  // 1. Normalize digits first
  const normalizedDigits = normalizeDigits(rawText);
  const lower = normalizedDigits.toLowerCase();

  // 2. Exempt request/order codes (e.g. REQ-ABC12345, ORD-12345678)
  const textWithoutCodes = lower.replace(/\b(req|ord)-[a-z0-9-]+\b/gi, " [CODE] ");

  // 3. Exempt standard realistic dates (e.g. 2026-10-27, 27/10/2026, 27-10-2026, 2026/10/27)
  const textWithoutDates = textWithoutCodes
    .replace(/\b(19\d\d|20\d\d)[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/g, " [DATE] ")
    .replace(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](19\d\d|20\d\d)\b/g, " [DATE] ");

  // 4. Check for links & social handles / chat links
  const linkPatterns = [
    /\bhttps?:\/\/[^\s]+/i,
    /\bwww\.[^\s]+/i,
    /\bwa\.me\/[^\s]+/i,
    /\bt\.me\/[^\s]+/i,
    /\bm\.me\/[^\s]+/i,
    /\bfacebook\.com\/[^\s]+/i,
    /\bfb\.com\/[^\s]+/i,
    /\bfb\.me\/[^\s]+/i,
    /\binstagram\.com\/[^\s]+/i,
    /(?:^|\s)@[a-z0-9_]{3,30}\b/i, // @handle
  ];

  for (const pattern of linkPatterns) {
    const match = textWithoutDates.match(pattern);
    if (match) {
      return {
        hasContact: true,
        pattern: match[0].trim(),
        reason: "link_or_handle",
      };
    }
  }

  // 5. Check for emails (direct or obfuscated)
  const directEmailMatch = textWithoutDates.match(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
  );
  if (directEmailMatch) {
    return {
      hasContact: true,
      pattern: directEmailMatch[0],
      reason: "email",
    };
  }

  const obfuscatedEmailMatch = textWithoutDates.match(
    /[a-z0-9._%+-]+\s*(?:\[at\]|\(at\)|\bat\b)\s*[a-z0-9.-]+\s*(?:\.|\bdot\b|\[dot\]|\(dot\))\s*[a-z]{2,}/i
  );
  if (obfuscatedEmailMatch) {
    return {
      hasContact: true,
      pattern: obfuscatedEmailMatch[0],
      reason: "email_obfuscated",
    };
  }

  // 6. Check for chat app keywords followed by digits
  const chatKeywords = [
    "whatsapp",
    "হোয়াটসঅ্যাপ",
    "imo",
    "ইমো",
    "viber",
    "ভাইবার",
    "telegram",
    "টেলিগ্রাম",
  ];
  for (const kw of chatKeywords) {
    const kwRegex = new RegExp(
      `${kw}[^a-z0-9]{0,10}(\\+?[0-9\\s.-]{5,})`,
      "i"
    );
    const match = textWithoutDates.match(kwRegex);
    if (match) {
      const digitsOnly = match[1].replace(/\D/g, "");
      if (digitsOnly.length >= 6) {
        return {
          hasContact: true,
          pattern: match[0],
          reason: "chat_app_number",
        };
      }
    }
  }

  // 7. Strip allowed unit numbers before checking digit sequences:
  // Numbers followed by units should not be glued into phone numbers or flagged if <= 7 digits
  const unitRegex =
    /(\d+)\s*(?:টাকা|tk|৳|taka|bdt|pcs|পিস|কেজি|kg|gm|গ্রাম|ml|মিলি|লিটার|l|ltr|litre|boxes|বক্স|কার্টন|carton|বস্তা|ব্যাগ|bag|meter|মিটার|inch|ইঞ্চি|gauge|গেজ|gsm|জিএসএম)\b/gi;

  const textWithoutUnits = textWithoutDates.replace(
    unitRegex,
    " [UNIT_NUM] "
  );

  // Look for any run of digits separated only by punctuation, spaces or symbols (e.g. 01712-345678, 0 1 7 ..., 0.1.7...)
  // Notice we place hyphen at the beginning of character class: `[- \t._()/\\,]`
  const digitSequenceRegex = /(?:\+?88)?(?:[0-9][- \t._()/\\,]*){9,}[0-9]/g;
  const seqMatches = textWithoutUnits.match(digitSequenceRegex);
  if (seqMatches) {
    for (const seq of seqMatches) {
      const cleanDigits = seq.replace(/\D/g, "");
      // BD mobile check: starts with 8801 or 01 or 1, followed by [3-9] and 8 digits (11 digits total with leading 0)
      const bdMobileMatch = cleanDigits.match(/(?:880|0)?1[3-9]\d{8}$/);
      if (bdMobileMatch) {
        return {
          hasContact: true,
          pattern: seq,
          reason: "bd_phone_number",
        };
      }
      // Any run of >= 10 digits
      if (cleanDigits.length >= 10) {
        return {
          hasContact: true,
          pattern: seq,
          reason: "long_digit_run",
        };
      }
    }
  }

  // Also check direct BD mobile pattern without space separation:
  const directMobile = textWithoutUnits.match(/(?:\+?880|0)?1[3-9]\d{8}\b/);
  if (directMobile) {
    return {
      hasContact: true,
      pattern: directMobile[0],
      reason: "bd_phone_number",
    };
  }

  return { hasContact: false };
}
