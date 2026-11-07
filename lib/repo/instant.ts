/**
 * lib/repo/instant.ts
 *
 * The instant answer: for a need typed in plain words, the suppliers that list it and what similar
 * buyers were really quoted. Only public listings and publishable market prices are used, so an
 * answer never reveals more than /search and /prices do, and every number comes from a record.
 */

import { parseNeed } from "@/lib/instant/parse";
import { parseSearchQuery } from "@/lib/search/query";
import { searchListings, type ListingHit } from "@/lib/repo/search";
import { latestSnapshots } from "@/lib/repo/pricing";
import { quantityBand } from "@/lib/pricing/compute";

const MAX_SUPPLIERS = 5;

export interface InstantPrice {
  categorySlug: string;
  specLabel: unknown;
  unit: string;
  currency: string;
  quantityBand: string;
  deliveryIncluded: boolean;
  p25: number;
  median: number;
  p75: number;
  sampleQuotes: number;
  sampleSuppliers: number;
}

export interface InstantAnswer {
  quantity: number | null;
  /** False when nothing matched every word and these are the closest listings in the category. */
  exact: boolean;
  categorySlug: string | null;
  listings: ListingHit[];
  price: InstantPrice | null;
}

async function findListings(terms: string[]): Promise<{ hits: ListingHit[]; exact: boolean }> {
  const filters = { verifiedOnly: false };
  const exact = await searchListings(parseSearchQuery(terms.join(" ")), filters);
  if (exact.length > 0) return { hits: exact, exact: true };

  // Words the catalog does not use (an area, a brand): retry on the words that name a product
  const productTerms = terms.filter((t) => parseSearchQuery(t).categorySlugs.length > 0);
  if (productTerms.length === 0 || productTerms.length === terms.length) return { hits: [], exact: false };
  const near = await searchListings(parseSearchQuery(productTerms[0]), filters);
  return { hits: near, exact: false };
}

/** The published price group that fits: same category, no conflicting size, the right quantity band first. */
function fitPrice(rows: Awaited<ReturnType<typeof latestSnapshots>>, categorySlug: string | null, sizes: string[], quantity: number | null): InstantPrice | null {
  if (!categorySlug) return null;
  const band = quantity ? quantityBand(quantity) : null;
  const candidates = rows.filter((row) => {
    if (row.category.slug !== categorySlug) return false;
    if (sizes.length === 0) return true;
    const numbers = Object.values((row.specLabel as Record<string, unknown>) ?? {}).filter((v) => typeof v === "number").map(String);
    return numbers.length === 0 || numbers.some((n) => sizes.includes(n));
  });
  const best = candidates.find((row) => row.quantityBand === band) ?? candidates[0];
  if (!best) return null;
  return {
    categorySlug,
    specLabel: best.specLabel,
    unit: best.unit,
    currency: best.currency,
    quantityBand: best.quantityBand,
    deliveryIncluded: best.deliveryIncluded,
    p25: Number(best.p25),
    median: Number(best.median),
    p75: Number(best.p75),
    sampleQuotes: best.sampleQuotes,
    sampleSuppliers: best.sampleSuppliers,
  };
}

export async function getInstantAnswer(raw: string): Promise<InstantAnswer> {
  const need = parseNeed(raw);
  if (need.terms.length === 0) return { quantity: need.quantity, exact: false, categorySlug: null, listings: [], price: null };

  const { hits, exact } = await findListings(need.terms);

  // One line per supplier: their best match, verified suppliers already ranked first
  const seen = new Set<string>();
  const listings = hits.filter((h) => !seen.has(h.businessId) && seen.add(h.businessId)).slice(0, MAX_SUPPLIERS);
  const categorySlug = listings[0]?.categorySlug ?? parseSearchQuery(need.terms.join(" ")).categorySlugs[0] ?? null;
  const price = fitPrice(await latestSnapshots(), categorySlug, need.sizes, need.quantity);

  return { quantity: need.quantity, exact, categorySlug, listings, price };
}
