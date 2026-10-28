"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search as SearchIcon, SlidersHorizontal, MapPin, Package } from "lucide-react";
import { T, useT, useLang } from "@/components/ui/T";
import { VerificationBadge } from "@/components/business/VerificationBadge";
import { formatMoney } from "@/lib/money";

const AREAS = ["Mirpur", "Dhanmondi", "Mohammadpur", "Uttara", "Gulshan", "Chawkbazar"];

type Tab = "products" | "businesses";

interface Category {
  id: string;
  slug: string;
  attributeSchema: { fields?: Array<{ key: string; type: string; filterable?: boolean; options?: string[] }> };
}

function requestLink(categorySlug: string | null, supplier?: { id: string; name: string }) {
  const params = new URLSearchParams();
  if (categorySlug) params.set("category", categorySlug);
  if (supplier) {
    params.set("supplier", supplier.id);
    params.set("supplierName", supplier.name);
  }
  return `/requests/new?${params}`;
}

export default function SearchPage() {
  const t = useT();
  const lang = useLang();

  const [tab, setTab] = useState<Tab>("products");
  const [q, setQ] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [area, setArea] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [moqMax, setMoqMax] = useState("");
  const [attrs, setAttrs] = useState<Record<string, string>>({});

  const [results, setResults] = useState<any[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const categorySlug = params.get("category");
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d)) return;
        setCategories(d);
        // Category tiles on the home page link here with ?category=<slug>
        const match = categorySlug ? d.find((c: Category) => c.slug === categorySlug) : null;
        if (match) setCategoryId(match.id);
      })
      .catch(() => {});
  }, []);

  const run = useCallback(
    async (offset = 0) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ tab, q, verified: verifiedOnly ? "1" : "0", offset: String(offset) });
        if (categoryId) params.set("categoryId", categoryId);
        if (area) params.set("area", area);
        if (tab === "products") {
          if (priceMin) params.set("priceMin", priceMin);
          if (priceMax) params.set("priceMax", priceMax);
          if (moqMax) params.set("moqMax", moqMax);
          for (const [k, v] of Object.entries(attrs)) if (v) params.set(`attr.${k}`, v);
        }
        const res = await fetch(`/api/search?${params}`);
        const json = await res.json();
        setResults((prev) => (offset === 0 ? json.results || [] : [...prev, ...(json.results || [])]));
        setNextOffset(json.nextOffset ?? null);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    },
    [tab, q, verifiedOnly, categoryId, area, priceMin, priceMax, moqMax, attrs]
  );

  // ?q= from the header search box (also when it changes while this page is open)
  const urlQ = useSearchParams().get("q") || "";
  const [urlRun, setUrlRun] = useState(0);
  useEffect(() => {
    if (!urlQ) return;
    setQ(urlQ);
    setUrlRun((n) => n + 1);
  }, [urlQ]);
  useEffect(() => {
    if (urlRun) run(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRun]);

  // Re-run when the tab or filters change (the text query runs on submit)
  useEffect(() => {
    run(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, verifiedOnly, categoryId, area, attrs]);

  const category = categories.find((c) => c.id === categoryId) || null;
  const filterableFields = (category?.attributeSchema?.fields || []).filter(
    (f) => f.filterable && (f.type === "select" || f.type === "boolean")
  );

  return (
    <div className="page space-y-4">
      <h1 className="page-title">
        <T k="search.title" />
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(0);
        }}
        className="flex gap-2"
      >
        <input
          id="search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("search.placeholder")}
          className="flex-1 text-sm p-3 rounded-xl border border-gray-200 focus:border-primary outline-none"
        />
        <button
          type="submit"
          id="search-submit"
          aria-label={t("search.go")}
          className="px-4 min-h-[44px] rounded-xl bg-primary text-white"
        >
          <SearchIcon className="w-4 h-4" />
        </button>
      </form>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {(["products", "businesses"] as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              id={`search-tab-${value}`}
              onClick={() => {
                // Old hits have the other tab's shape; clear them before the new search returns
                setResults([]);
                setNextOffset(null);
                setTab(value);
              }}
              className={`px-4 py-2 rounded-full text-xs font-semibold border ${
                tab === value ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              <T k={value === "products" ? "search.tabProducts" : "search.tabBusinesses"} />
            </button>
          ))}
        </div>
        <button
          type="button"
          id="search-filters-toggle"
          onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-gray-600 px-3 py-2"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <T k="search.filters" />
        </button>
      </div>

      {showFilters && (
        <div className="card p-4 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <select
              id="search-category"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setAttrs({});
              }}
              aria-label={t("listing.category")}
              className="p-2.5 rounded-xl border border-gray-200 bg-white"
            >
              <option value="">{t("search.allCategories")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {t(`category.${c.slug}`)}
                </option>
              ))}
            </select>
            <select
              id="search-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              aria-label={t("rfq.deliveryArea")}
              className="p-2.5 rounded-xl border border-gray-200 bg-white"
            >
              <option value="">{t("search.allAreas")}</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input
              id="search-verified"
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
            />
            <span>
              <T k="search.verifiedOnly" />
            </span>
          </label>
          {tab === "products" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <input
                  id="search-price-min"
                  type="number"
                  min="0"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  placeholder={t("search.priceMin")}
                  aria-label={t("search.priceMin")}
                  className="p-2.5 rounded-xl border border-gray-200"
                />
                <input
                  id="search-price-max"
                  type="number"
                  min="0"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  placeholder={t("search.priceMax")}
                  aria-label={t("search.priceMax")}
                  className="p-2.5 rounded-xl border border-gray-200"
                />
                <input
                  id="search-moq-max"
                  type="number"
                  min="0"
                  value={moqMax}
                  onChange={(e) => setMoqMax(e.target.value)}
                  placeholder={t("search.moqMax")}
                  aria-label={t("search.moqMax")}
                  className="p-2.5 rounded-xl border border-gray-200"
                />
              </div>
              {category &&
                filterableFields.map((f) => (
                  <select
                    key={f.key}
                    id={`search-attr-${f.key}`}
                    value={attrs[f.key] || ""}
                    onChange={(e) => setAttrs((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    aria-label={t(`attr.${category.slug}.${f.key}.label`)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 bg-white"
                  >
                    <option value="">{t("search.anyField", undefined, { field: t(`attr.${category.slug}.${f.key}.label`) })}</option>
                    {(f.type === "boolean" ? ["true", "false"] : f.options || []).map((opt) => (
                      <option key={opt} value={opt}>
                        {f.type === "boolean"
                          ? t(opt === "true" ? "common.yes" : "common.no")
                          : t(`attr.${category.slug}.${f.key}.opt.${opt}`)}
                      </option>
                    ))}
                  </select>
                ))}
              <button
                type="button"
                onClick={() => run(0)}
                className="w-full py-2.5 rounded-xl bg-gray-900 text-white font-semibold"
              >
                <T k="search.go" />
              </button>
            </>
          )}
        </div>
      )}

      <div id="search-results" className="space-y-3">
        {tab === "products" &&
          results.map((r) => (
            <div key={r.id} data-listing-title={r.title} className="card p-4 space-y-2">
              <Link href={`/l/${r.id}`} className="font-semibold text-sm text-gray-900 block">
                {r.title}
              </Link>
              <div className="flex items-center gap-1.5 text-xs text-gray-600 flex-wrap">
                <Link href={`/b/${r.businessSlug}`} className="font-medium">
                  {r.businessName}
                </Link>
                <VerificationBadge status={r.verificationStatus} />
                <span className="flex items-center gap-0.5 text-gray-400">
                  <MapPin className="w-3 h-3" />
                  {r.businessArea}
                </span>
              </div>
              <div className="text-xs text-gray-700 flex gap-3 flex-wrap">
                {r.priceMin && (
                  <span>
                    {t("search.priceRange", undefined, {
                      min: formatMoney(r.priceMin, lang),
                      max: formatMoney(r.priceMax ?? r.priceMin, lang),
                      unit: r.unit,
                    })}
                  </span>
                )}
                {r.moq && <span>{t("search.moq", undefined, { moq: r.moq })}</span>}
              </div>
              <Link
                href={requestLink(r.categorySlug, { id: r.businessId, name: r.businessName })}
                className="inline-block text-xs font-bold text-primary py-2"
              >
                <T k="search.requestQuote" />
              </Link>
            </div>
          ))}

        {tab === "businesses" &&
          results.map((b) => (
            <div key={b.id} data-business-name={b.name} className="card p-4 space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Link href={`/b/${b.slug}`} className="font-semibold text-sm text-gray-900">
                  {b.name}
                </Link>
                <VerificationBadge status={b.verificationStatus} />
              </div>
              <div className="text-xs text-gray-500 flex gap-3 flex-wrap">
                <span className="flex items-center gap-0.5">
                  <MapPin className="w-3 h-3" />
                  {b.area}
                </span>
                <span className="flex items-center gap-0.5">
                  <Package className="w-3 h-3" />
                  {t("search.listingCount", undefined, { n: b.listingCount })}
                </span>
              </div>
              {(b.categorySlugs ?? []).length > 0 && (
                <p className="text-xs text-gray-500">
                  {b.categorySlugs.map((s: string) => t(`category.${s}`)).join(" · ")}
                </p>
              )}
              <Link
                href={requestLink(b.categorySlugs?.[0] ?? null, { id: b.id, name: b.name })}
                className="inline-block text-xs font-bold text-primary py-2"
              >
                <T k="search.requestQuote" />
              </Link>
            </div>
          ))}

        {searched && !loading && results.length === 0 && (
          <div id="search-empty" className="card p-6 text-center space-y-3">
            <p className="text-sm text-gray-600">
              <T k="search.notFound" />
            </p>
            <Link
              href={requestLink(category?.slug ?? null)}
              className="inline-block px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold"
            >
              <T k="search.postRequest" />
            </Link>
          </div>
        )}

        {nextOffset !== null && (
          <button
            type="button"
            onClick={() => run(nextOffset)}
            disabled={loading}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700"
          >
            {loading ? t("common.loading") : t("search.loadMore")}
          </button>
        )}
      </div>
    </div>
  );
}
