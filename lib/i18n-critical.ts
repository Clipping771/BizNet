/**
 * Critical UI keys (§11): a language may become ACTIVE only when ≥ 90% of these are approved.
 * They cover navigation, sign-in and the whole core loop a buyer or supplier must understand.
 */
const CRITICAL_PREFIXES = [
  "nav.",
  "auth.",
  "common.",
  "rfq.",
  "quote.",
  "order.",
  "msg.",
  "feedback.",
  "payterm.",
  "priority.",
  "reqStatus.",
  "quoteStatus.",
  "cmp.",
];

export function isCriticalKey(key: string): boolean {
  return CRITICAL_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export const ACTIVATION_CRITICAL_SHARE = 0.9;

/** `{name}` placeholders in a message, sorted and de-duplicated. */
export function placeholdersOf(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}
