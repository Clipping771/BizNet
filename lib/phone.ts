/**
 * Normalizes phone numbers to standard E.164 format.
 * Strictly validates Bangladeshi numbers to +8801[3-9]\d{8} (§8.1).
 * Supports valid international E.164 numbers (+1, +44, +971, etc.).
 */
export function normalizePhone(phone: string): string | null {
  if (!phone) return null;

  // Convert Bengali/Arabic-indic digits to Latin digits
  const digitMap: Record<string, string> = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  };

  const latin = phone
    .split('')
    .map((c) => digitMap[c] ?? c)
    .join('')
    .replace(/[^\d+]/g, '');

  const withoutPlus = latin.startsWith('+') ? latin.slice(1) : latin;

  // 1. Bangladeshi numbers: starts with +880, 880, or local 01
  if (withoutPlus.startsWith('880')) {
    const after880 = withoutPlus.slice(3); // e.g. '1712345678'
    if (/^1[3-9]\d{8}$/.test(after880)) {
      return '+880' + after880;
    }
    // Any number starting with 880 that does not match 1[3-9]\d{8} is an invalid BD number
    return null;
  }

  if (withoutPlus.startsWith('01')) {
    if (/^01[3-9]\d{8}$/.test(withoutPlus)) {
      return '+88' + withoutPlus;
    }
    return null;
  }

  // 2. Foreign international numbers with explicit '+'
  if (latin.startsWith('+')) {
    if (/^[1-9]\d{6,14}$/.test(withoutPlus)) {
      return '+' + withoutPlus;
    }
    return null;
  }

  // 3. Foreign numbers without '+' (min 8 digits)
  if (/^[1-9]\d{7,14}$/.test(withoutPlus)) {
    return '+' + withoutPlus;
  }

  return null;
}

export const normalizeBdPhone = normalizePhone;

export function isValidBdPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return normalized !== null && /^(\+8801[3-9]\d{8})$/.test(normalized);
}
