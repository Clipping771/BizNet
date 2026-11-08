"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search as SearchIcon, SlidersHorizontal, MapPin, Package } from "lucide-react";
import { T, useT, useLang } from "@/components/ui/T";
import { VerificationBadge } from "@/components/business/VerificationBadge";
import { ListSkeleton } from "@/components/ui/ListStates";
import { Avatar } from "@/components/layout/AccountMenu";
import { CategoryVisual } from "@/components/ui/CategoryVisual";
import { formatMoney } from "@/lib/money";

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
  const urlQ = useSearchParams().get("q") || "";
  const [q, setQ] = useState(urlQ);
  // Only the newest search may fill the list; a slower older response must not overwrite it
  const latestRun = useRef(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [area, setArea] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
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
    fetch("/api/search/areas")
      .then((r) => r.json())
      .then((d) => setAreas(Array.isArray(d.areas) ? d.areas : []))
      .catch(() => {});
  }, []);

  const run = useCallback(
    async (offset = 0, query = q) => {
      const runId = ++latestRun.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ tab, q: query, verified: verifiedOnly ? "1" : "0", offset: String(offset) });
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
        if (runId !== latestRun.current) return;
        setResults((prev) => (offset === 0 ? json.results || [] : [...prev, ...(json.results || [])]));
        setNextOffset(json.nextOffset ?? null);
        setSearched(true);
      } finally {
        if (runId === latestRun.current) setLoading(false);
      }
    },
    [tab, q, verifiedOnly, categoryId, area, priceMin, priceMax, moqMax, attrs]
  );

  // A changed ?q= while this page is open searches for it straight away
  const firstUrlQ = useRef(urlQ);
  useEffect(() => {
    if (urlQ === firstUrlQ.current) return;
    firstUrlQ.current = urlQ;
    setQ(urlQ);
    run(0, urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

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
    <div className="page-wide space-y-4">
      <div>
        <h1 className="page-title">
          <T k="search.title" />
        </h1>
        <p className="page-subtitle">
          <T k="search.description" />
        </p>
      </div>

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
          className="input flex-1"
        />
        <button type="submit" id="search-submit" aria-label={t("search.go")} className="btn btn-primary h-10 px-4">

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
              className={`btn btn-sm ${tab === value ? "bg-primary-700 text-white" : "btn-secondary"}`}
            >
              <T k={value === "products" ? "search.tabProducts" : "search.tabBusinesses"} />
            </button>
          ))}
        </div>
        <button
          type="button"
          id="search-filters-toggle"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className="btn btn-ghost btn-sm lg:hidden"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <T k="search.filters" />
        </button>
      </div>

      <div className="items-start gap-6 space-y-4 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:space-y-0">
      {(
        <div id="search-filters" className={`card space-y-3 p-4 text-xs lg:sticky lg:top-20 lg:block ${showFilters ? "" : "hidden"}`}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <select
              id="search-category"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setAttrs({});
              }}
              aria-label={t("listing.category")}
              className="input"
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
              className="input"
            >
              <option value="">{t("search.allAreas")}</option>
              {areas.map((a) => (
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
              <div className="grid grid-cols-3 gap-2 lg:grid-cols-2">
                <input
                  id="search-price-min"
                  type="number"
                  min="0"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  placeholder={t("search.priceMin")}
                  aria-label={t("search.priceMin")}
                  className="input"
                />
                <input
                  id="search-price-max"
                  type="number"
                  min="0"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  placeholder={t("search.priceMax")}
                  aria-label={t("search.priceMax")}
                  className="input"
                />
                <input
                  id="search-moq-max"
                  type="number"
                  min="0"
                  value={moqMax}
                  onChange={(e) => setMoqMax(e.target.value)}
                  placeholder={t("search.moqMax")}
                  aria-label={t("search.moqMax")}
                  className="input lg:col-span-2"
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
                    className="input"
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
                className="btn btn-primary w-full"
              >
                <T k="search.go" />
              </button>
            </>
          )}
        </div>
      )}

      <div id="search-results" className="min-w-0 space-y-3">
        {loading && results.length === 0 && <ListSkeleton />}

        {tab === "products" && results.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((r) => (
              <li key={r.id} data-listing-title={r.title} className="card flex flex-col overflow-hidden transition-shadow hover:shadow-raised">
                <div className="flex flex-1 gap-3 p-4 sm:block">
                  <CategoryVisual slug={r.categorySlug} size={32} className="h-16 w-16 rounded-lg sm:mb-3 sm:h-24 sm:w-full" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/l/${r.id}`} className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 hover:text-primary-700">
                      {r.title}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <Link href={`/b/${r.businessSlug}`} className="font-medium text-slate-700 hover:text-primary-700">
                        {r.businessName}
                      </Link>
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />
                        {r.businessArea}
                      </span>
                    </div>
                    <div className="mt-2">
                      <VerificationBadge status={r.verificationStatus} />
                    </div>
                  </div>
                </div>
                <div className="mt-auto space-y-2.5 border-t border-slate-100 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-slate-500">
                    {r.priceMin && (
                      <p className="text-sm font-semibold tabular-nums text-slate-900">
                        {t("search.priceRange", undefined, {
                          min: formatMoney(r.priceMin, lang, r.currency),
                          max: formatMoney(r.priceMax ?? r.priceMin, lang, r.currency),
                          unit: r.unit,
                        })}
                      </p>
                    )}
                    {r.moq && <p>{t("search.moq", undefined, { moq: r.moq })}</p>}
                  </div>
                  <Link href={requestLink(r.categorySlug, { id: r.businessId, name: r.businessName })} className="btn btn-primary btn-sm w-full">
                    <T k="search.requestQuote" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        {tab === "businesses" && results.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((b) => (
              <li key={b.id} data-business-name={b.name} className="card flex flex-col gap-3 p-4 transition-shadow hover:shadow-raised">
                <div className="flex items-start gap-3">
                  <Avatar name={b.name} size="h-12 w-12 text-base" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/b/${b.slug}`} className="block text-[15px] font-semibold leading-snug text-slate-900 hover:text-primary-700">
                      {b.name}
                    </Link>
                    <div className="mt-1.5">
                      <VerificationBadge status={b.verificationStatus} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" />
                    {b.area}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Package className="h-3 w-3" />
                    {t("search.listingCount", undefined, { n: b.listingCount })}
                  </span>
                  {(b.categorySlugs ?? []).length > 0 && <span>{b.categorySlugs.map((s: string) => t(`category.${s}`)).join(" · ")}</span>}
                </div>
                <Link href={requestLink(b.categorySlugs?.[0] ?? null, { id: b.id, name: b.name })} className="btn btn-secondary btn-sm mt-auto w-full">
                  <T k="search.requestQuote" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {searched && !loading && results.length === 0 && (
          <div id="search-empty" className="card space-y-3 p-8 text-center">
            <p className="text-sm text-slate-600">
              <T k="search.notFound" />
            </p>
            <Link href={requestLink(category?.slug ?? null)} className="btn btn-primary btn-sm">
              <T k="search.postRequest" />
            </Link>
          </div>
        )}

        {nextOffset !== null && (
          <button type="button" onClick={() => run(nextOffset)} disabled={loading} className="btn btn-secondary w-full">
            {loading ? t("common.loading") : t("search.loadMore")}
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
