/**
 * lib/instant/parse.ts
 *
 * Reads a need typed in plain words ("500 ta 750ml container lagbe") without AI, so an answer can
 * appear while the person types and cost nothing. Quantity is only taken when the words say it is
 * one; a bare number stays a specification ("কাপ ২৫০" is a 250 ml cup, not 250 cups).
 */

import { toLatinDigits } from "@/lib/search/query";

const QUANTITY_WORDS = "ta|ti|pcs|pc|piece|pieces|pis|টা|টি|পিস|পিচ|khana|খানা";
const SIZE_WORDS = "ml|মিলি|milli|gsm|oz|gm|gram|গ্রাম|inch|ইঞ্চি|cm|সেমি";

/** Words that describe the request rather than the product, in English, Banglish and Bangla. */
const FILLER = new Set(
  "a an the i we need want looking for of to in at by with and please urgent buy get lagbe lagbe. dorkar chai amar amader ami amra e te ar er kal kalke ajke aj tomorrow today porshu next week moto jonno লাগবে দরকার চাই আমার আমাদের আমি আমরা কাল আগামীকাল আজ পরশু সহ জন্য এবং ও".split(" ")
);

export interface ParsedNeed {
  quantity: number | null;
  /** Product words and size numbers, ready for catalog search. */
  terms: string[];
  /** Size numbers mentioned, to tell which price group fits. */
  sizes: string[];
}

export function parseNeed(raw: string): ParsedNeed {
  let text = toLatinDigits(raw.toLowerCase()).slice(0, 200);
  let quantity: number | null = null;

  // "500 ta", "500টা", "500 pcs". Unicode letters do not count as \w, so the end is checked by hand.
  text = text.replace(new RegExp(`(\\d[\\d,]*)\\s*(${QUANTITY_WORDS})(?=$|[\\s,.;:!?])`, "u"), (_, n: string) => {
    const value = Number(n.replace(/,/g, ""));
    if (value > 0) quantity = value;
    return " ";
  });

  // "750 ml", "750ml", "৭৫০ মিলি" all become the number, which also finds a title written either way
  const sizes: string[] = [];
  text = text.replace(new RegExp(`(\\d+)\\s*(${SIZE_WORDS})(?=$|[\\s,.;:!?])`, "gu"), (_, n: string) => {
    sizes.push(n);
    return ` ${n} `;
  });

  const tokens = text.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const terms: string[] = [];
  for (const token of tokens) {
    if (FILLER.has(token) || (token.length < 2 && !/\d/.test(token))) continue;
    if (/^\d+$/.test(token) && !sizes.includes(token)) sizes.push(token);
    if (!terms.includes(token)) terms.push(token);
  }
  return { quantity, terms, sizes };
}
