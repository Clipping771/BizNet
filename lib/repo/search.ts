/**
 * lib/repo/search.ts
 *
 * Full-text + trigram search over suppliers and listings (§8.13).
 * Ranking: ts_rank + trigram similarity + verified boost (+ has-listing boost for businesses).
 * Only suppliers that passed verification (BASIC/VERIFIED) and are not suspended are public.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ParsedQuery } from "@/lib/search/query";

export const SEARCH_PAGE_SIZE = 20;

export interface SearchFilters {
  categoryId?: string | null;
  area?: string | null;
  /** true (default): VERIFIED only; false: BASIC and VERIFIED. */
  verifiedOnly?: boolean;
  priceMin?: number | null;
  priceMax?: number | null;
  moqMax?: number | null;
  /** Filterable attribute equality filters, already validated against the category schema. */
  attributes?: Record<string, string>;
  offset?: number;
}

export interface ListingHit {
  id: string;
  title: string;
  unit: string;
  priceMin: string | null;
  priceMax: string | null;
  moq: number | null;
  imageKey: string | null;
  categoryId: string;
  categorySlug: string;
  businessId: string;
  businessSlug: string;
  businessName: string;
  businessArea: string;
  verificationStatus: string;
  score: number;
}

export interface BusinessHit {
  id: string;
  slug: string;
  name: string;
  area: string;
  businessType: string;
  verificationStatus: string;
  listingCount: number;
  categorySlugs: string[];
  score: number;
}

function levels(verifiedOnly: boolean | undefined) {
  return verifiedOnly === false ? ["BASIC", "VERIFIED"] : ["VERIFIED"];
}

async function categoryIdsForSlugs(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const rows = await prisma.category.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Text condition: full-text match, trigram similarity, or (single-word query) its category. */
function textCondition(q: ParsedQuery, titleColumn: Prisma.Sql, vectorColumn: Prisma.Sql, categoryIds: string[], categoryColumn: Prisma.Sql) {
  if (!q.tsquery) return Prisma.sql`TRUE`;
  const byCategory =
    categoryIds.length > 0 && q.terms.length === 1
      ? Prisma.sql` OR ${categoryColumn} IN (${Prisma.join(categoryIds)})`
      : Prisma.empty;
  return Prisma.sql`(${vectorColumn} @@ to_tsquery('simple', unaccent(${q.tsquery}))
    OR similarity(${titleColumn}, ${q.text}) > 0.3${byCategory})`;
}

function rankExpr(q: ParsedQuery, titleColumn: Prisma.Sql, vectorColumn: Prisma.Sql) {
  if (!q.tsquery) return Prisma.sql`0`;
  return Prisma.sql`(ts_rank(${vectorColumn}, to_tsquery('simple', unaccent(${q.tsquery}))) + similarity(${titleColumn}, ${q.text}))`;
}

export async function searchListings(q: ParsedQuery, f: SearchFilters): Promise<ListingHit[]> {
  const categoryIds = await categoryIdsForSlugs(q.categorySlugs);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`l."isActive" = TRUE`,
    Prisma.sql`l."deletedAt" IS NULL`,
    Prisma.sql`b."isSupplier" = TRUE`,
    Prisma.sql`b."isSuspended" = FALSE`,
    Prisma.sql`b."deletedAt" IS NULL`,
    Prisma.sql`b."verificationStatus"::text IN (${Prisma.join(levels(f.verifiedOnly))})`,
    textCondition(q, Prisma.sql`l.title`, Prisma.sql`l.search_vector`, categoryIds, Prisma.sql`l."categoryId"`),
  ];
  if (f.categoryId) conditions.push(Prisma.sql`l."categoryId" = ${f.categoryId}`);
  if (f.area) conditions.push(Prisma.sql`(b.area = ${f.area} OR ${f.area} = ANY(b."deliveryAreas"))`);
  if (f.priceMin != null) conditions.push(Prisma.sql`COALESCE(l."priceMax", l."priceMin") >= ${f.priceMin}`);
  if (f.priceMax != null) conditions.push(Prisma.sql`COALESCE(l."priceMin", l."priceMax") <= ${f.priceMax}`);
  if (f.moqMax != null) conditions.push(Prisma.sql`(l.moq IS NULL OR l.moq <= ${f.moqMax})`);
  for (const [key, value] of Object.entries(f.attributes ?? {})) {
    conditions.push(Prisma.sql`l.attributes ->> ${key} = ${value}`);
  }

  const rows = await prisma.$queryRaw<any[]>`
    SELECT l.id, l.title, l.unit, l."priceMin"::text AS "priceMin", l."priceMax"::text AS "priceMax", l.moq,
           l."imageKeys"[1] AS "imageKey", l."categoryId", c.slug AS "categorySlug",
           b.id AS "businessId", b.slug AS "businessSlug", b.name AS "businessName", b.area AS "businessArea",
           b."verificationStatus"::text AS "verificationStatus",
           (${rankExpr(q, Prisma.sql`l.title`, Prisma.sql`l.search_vector`)}
             + CASE b."verificationStatus"::text WHEN 'VERIFIED' THEN 0.3 WHEN 'BASIC' THEN 0.15 ELSE 0 END)::float AS score
    FROM "Listing" l
    JOIN "Business" b ON b.id = l."businessId"
    JOIN "Category" c ON c.id = l."categoryId"
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY score DESC, l.id
    LIMIT ${SEARCH_PAGE_SIZE} OFFSET ${f.offset ?? 0}`;
  return rows;
}

export async function searchBusinesses(q: ParsedQuery, f: SearchFilters): Promise<BusinessHit[]> {
  const categoryIds = await categoryIdsForSlugs(q.categorySlugs);
  // A supplier also matches when one of its active listings matches the query
  const listingMatch = q.tsquery
    ? Prisma.sql` OR EXISTS (SELECT 1 FROM "Listing" lm WHERE lm."businessId" = b.id AND lm."isActive" AND lm."deletedAt" IS NULL
        AND lm.search_vector @@ to_tsquery('simple', unaccent(${q.tsquery})))`
    : Prisma.empty;
  const categoryMatch =
    categoryIds.length > 0 && q.terms.length === 1
      ? Prisma.sql` OR EXISTS (SELECT 1 FROM "SupplierCategory" sc WHERE sc."businessId" = b.id AND sc."categoryId" IN (${Prisma.join(categoryIds)}))`
      : Prisma.empty;
  const text = q.tsquery
    ? Prisma.sql`(b.search_vector @@ to_tsquery('simple', unaccent(${q.tsquery})) OR similarity(b.name, ${q.text}) > 0.3${listingMatch}${categoryMatch})`
    : Prisma.sql`TRUE`;

  const conditions: Prisma.Sql[] = [
    Prisma.sql`b."isSupplier" = TRUE`,
    Prisma.sql`b."isSuspended" = FALSE`,
    Prisma.sql`b."deletedAt" IS NULL`,
    Prisma.sql`b."verificationStatus"::text IN (${Prisma.join(levels(f.verifiedOnly))})`,
    text,
  ];
  if (f.categoryId) {
    conditions.push(Prisma.sql`(EXISTS (SELECT 1 FROM "SupplierCategory" sc2 WHERE sc2."businessId" = b.id AND sc2."categoryId" = ${f.categoryId})
      OR EXISTS (SELECT 1 FROM "Listing" l2 WHERE l2."businessId" = b.id AND l2."categoryId" = ${f.categoryId} AND l2."isActive" AND l2."deletedAt" IS NULL))`);
  }
  if (f.area) conditions.push(Prisma.sql`(b.area = ${f.area} OR ${f.area} = ANY(b."deliveryAreas"))`);

  const rows = await prisma.$queryRaw<any[]>`
    SELECT b.id, b.slug, b.name, b.area, b."businessType", b."verificationStatus"::text AS "verificationStatus",
           (SELECT COUNT(*)::int FROM "Listing" lc WHERE lc."businessId" = b.id AND lc."isActive" AND lc."deletedAt" IS NULL) AS "listingCount",
           ARRAY(SELECT c.slug FROM "SupplierCategory" s JOIN "Category" c ON c.id = s."categoryId" WHERE s."businessId" = b.id ORDER BY c."sortOrder") AS "categorySlugs",
           (${rankExpr(q, Prisma.sql`b.name`, Prisma.sql`b.search_vector`)}
             + CASE b."verificationStatus"::text WHEN 'VERIFIED' THEN 0.3 WHEN 'BASIC' THEN 0.15 ELSE 0 END
             + CASE WHEN EXISTS (SELECT 1 FROM "Listing" lb WHERE lb."businessId" = b.id AND lb."isActive" AND lb."deletedAt" IS NULL) THEN 0.2 ELSE 0 END)::float AS score
    FROM "Business" b
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY score DESC, b.id
    LIMIT ${SEARCH_PAGE_SIZE} OFFSET ${f.offset ?? 0}`;
  return rows;
}

export async function getCategoryForSearch(categoryId: string) {
  return prisma.category.findUnique({ where: { id: categoryId }, select: { id: true, slug: true, attributeSchema: true } });
}
