import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { parseSearchQuery } from "@/lib/search/query";
import { searchBusinesses, searchListings, getCategoryForSearch, type SearchFilters } from "@/lib/repo/search";
import { logEvent } from "@/lib/events";
import { checkRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/ip";

function num(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * GET /api/search?tab=products|businesses&q=&categoryId=&area=&verified=1|0&priceMin=&priceMax=&moqMax=&attr.<key>=&offset=
 * Public read (suppliers and listings are public pages); logged-in users get the event attributed.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limit = await checkRateLimit(`search:ip:${ip}`, 120, 60);
    if (!limit.success) {
      return NextResponse.json({ error: "Too many searches, please slow down" }, { status: 429 });
    }

    const params = req.nextUrl.searchParams;
    const tab = params.get("tab") === "businesses" ? "businesses" : "products";
    const q = parseSearchQuery(params.get("q"));

    const filters: SearchFilters = {
      categoryId: params.get("categoryId") || null,
      area: params.get("area") || null,
      verifiedOnly: params.get("verified") !== "0",
      priceMin: num(params.get("priceMin")),
      priceMax: num(params.get("priceMax")),
      moqMax: num(params.get("moqMax")),
      offset: Math.min(Math.max(0, Math.floor(num(params.get("offset")) ?? 0)), 1000),
    };

    // Attribute filters only for filterable fields of the selected category
    if (filters.categoryId) {
      const category = await getCategoryForSearch(filters.categoryId);
      const filterable = new Set(
        (((category?.attributeSchema as any)?.fields as any[]) || []).filter((f) => f.filterable).map((f) => f.key)
      );
      const attributes: Record<string, string> = {};
      for (const [key, value] of params.entries()) {
        const field = key.startsWith("attr.") ? key.slice(5) : null;
        if (field && filterable.has(field) && value !== "") attributes[field] = value.slice(0, 50);
      }
      filters.attributes = attributes;
    }

    const results = tab === "businesses" ? await searchBusinesses(q, filters) : await searchListings(q, filters);

    const { user } = await getAuthzContext(req);
    await logEvent({
      name: "search",
      userId: user?.id ?? null,
      props: { q: q.text, tab, filters: { ...filters, offset: undefined }, resultCount: results.length },
    });

    return NextResponse.json({ tab, results, nextOffset: results.length === 20 ? (filters.offset ?? 0) + 20 : null });
  } catch (err: any) {
    console.error("Search error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
