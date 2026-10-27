/**
 * lib/discussion/selling.ts
 *
 * Selling filter for discussion posts (§8.14): admin-configured keywords plus any phone
 * number, link or handle. Pure function; the caller decides soft block vs PENDING_REVIEW.
 */

import { detectContactBypass } from "@/lib/contact/detect";

export interface SellingCheck {
  isSelling: boolean;
  /** The keyword or contact pattern that triggered the filter. */
  match?: string;
}

export function detectSelling(text: string, terms: string[]): SellingCheck {
  const lower = (text || "").toLowerCase();
  for (const term of terms) {
    const t = term.trim().toLowerCase();
    if (t && lower.includes(t)) return { isSelling: true, match: term };
  }
  const contact = detectContactBypass(text || "");
  if (contact.hasContact) return { isSelling: true, match: contact.pattern };
  return { isSelling: false };
}
