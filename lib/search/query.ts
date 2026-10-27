/**
 * lib/search/query.ts
 *
 * Pure query handling for search (§8.13): normalises digits, splits terms, expands
 * Bangla/English synonyms and builds a safe Postgres tsquery string. No AI.
 */

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

export function toLatinDigits(text: string): string {
  return text.replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)));
}

function toBanglaDigits(text: string): string {
  return text.replace(/[0-9]/g, (d) => BANGLA_DIGITS[Number(d)]);
}

/**
 * Bangla ↔ English (and common spelling) variants for the launch segment's vocabulary.
 * Each group is treated as one term: matching any variant matches the term.
 */
const SYNONYM_GROUPS: string[][] = [
  ["box", "boxes", "বক্স", "বাক্স"],
  ["container", "containers", "কন্টেইনার", "কনটেইনার"],
  ["cup", "cups", "কাপ", "গ্লাস", "glass"],
  ["bag", "bags", "ব্যাগ"],
  ["tissue", "টিস্যু", "napkin", "ন্যাপকিন"],
  ["foil", "ফয়েল"],
  ["spoon", "চামচ"],
  ["cutlery", "কাটলারি"],
  ["lid", "ঢাকনা"],
  ["paper", "পেপার", "কাগজ"],
  ["kraft", "ক্রাফট"],
  ["plastic", "প্লাস্টিক", "pp", "পিপি"],
  ["ml", "মিলি"],
  ["food", "ফুড", "খাবার"],
];

/** Category slugs a term points at, used to also return listings/suppliers of that category. */
const CATEGORY_TERMS: Record<string, string[]> = {
  food_boxes: ["box", "boxes", "বক্স", "বাক্স"],
  containers: ["container", "containers", "কন্টেইনার", "কনটেইনার"],
  cups: ["cup", "cups", "কাপ", "glass", "গ্লাস"],
  carry_bags: ["bag", "bags", "ব্যাগ"],
  tissue: ["tissue", "টিস্যু", "napkin", "ন্যাপকিন"],
  cutlery: ["cutlery", "কাটলারি", "spoon", "চামচ"],
  foil_wrap: ["foil", "ফয়েল"],
};

export interface ParsedQuery {
  /** Original text, trimmed (used for trigram similarity). */
  text: string;
  /** Each inner array is one term's variants. */
  terms: string[][];
  /** tsquery string (prefix matching, AND across terms, OR within variants), or null if empty. */
  tsquery: string | null;
  /** Category slugs mentioned by the query. */
  categorySlugs: string[];
}

// Letters, combining marks (Bangla vowel signs) and digits only — nothing tsquery could interpret.
const TOKEN = /[\p{L}\p{M}\p{N}]+/gu;

export function parseSearchQuery(raw: string | null | undefined): ParsedQuery {
  const text = (raw ?? "").trim().slice(0, 200);
  const tokens = (text.toLowerCase().match(TOKEN) ?? []).slice(0, 8);

  const terms: string[][] = [];
  const categorySlugs = new Set<string>();
  for (const token of tokens) {
    const variants = new Set<string>([token]);
    if (/[0-9০-৯]/.test(token)) {
      variants.add(toLatinDigits(token));
      variants.add(toBanglaDigits(toLatinDigits(token)));
    }
    for (const group of SYNONYM_GROUPS) {
      if (group.includes(token)) group.forEach((v) => variants.add(v));
    }
    for (const [slug, words] of Object.entries(CATEGORY_TERMS)) {
      if (words.includes(token)) categorySlugs.add(slug);
    }
    terms.push([...variants]);
  }

  const tsquery =
    terms.length === 0
      ? null
      : terms.map((variants) => `(${variants.map((v) => `${v}:*`).join(" | ")})`).join(" & ");

  return { text, terms, tsquery, categorySlugs: [...categorySlugs] };
}
