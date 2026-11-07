"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { T, useT, useLang } from "@/components/ui/T";
import { ListSkeleton } from "@/components/ui/ListStates";
import { formatMoney, formatNumber } from "@/lib/money";
import { formatDate } from "@/lib/dates";

interface PriceGroup {
  id: string;
  categorySlug: string;
  specLabel: Record<string, unknown>;
  unit: string;
  currency?: string;
  quantityBand: string;
  deliveryIncluded: boolean;
  area: string | null;
  periodStart: string;
  periodEnd: string;
  p25: string;
  median: string;
  p75: string;
  sampleQuotes: number;
  sampleSuppliers: number;
}

/** Public price ranges from real quotes (§8.15). Never presented as "the market price". */
export default function PricesPage() {
  const t = useT();
  const lang = useLang();
  const [groups, setGroups] = useState<PriceGroup[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; slug: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/prices").then((r) => r.json()), fetch("/api/categories").then((r) => r.json())])
      .then(([p, c]) => {
        setGroups(p.groups || []);
        setInsight(p.insight ?? null);
        if (Array.isArray(c)) setCategories(c.filter((cat: { slug: string }) => cat.slug !== "other"));
      })
      .finally(() => setLoading(false));
  }, []);

  const specText = (slug: string, label: Record<string, unknown>) =>
    Object.entries(label)
      .map(([key, value]) => {
        const name = t(`attr.${slug}.${key}.label`);
        if (typeof value === "boolean") return `${name}: ${t(value ? "common.yes" : "common.no")}`;
        const opt = t(`attr.${slug}.${key}.opt.${value}`);
        return `${name}: ${opt.startsWith("attr.") ? String(value) : opt}`;
      })
      .join(" · ");

  const withData = categories.filter((c) => groups.some((g) => g.categorySlug === c.slug));
  const withoutData = categories.filter((c) => !groups.some((g) => g.categorySlug === c.slug));

  return (
    <div className="page-wide space-y-4">
      <div>
        <h1 className="page-title">
          <T k="prices.title" />
        </h1>
        <p className="page-subtitle">
          <T k="prices.subtitle" />
        </p>
      </div>

      {loading && <ListSkeleton />}

      {insight && (
        <p id="market-insight" className="card flex items-start gap-2 p-4 text-sm text-slate-700">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            {insight}
            <span className="ms-1 text-xs text-slate-500">{t("ai.generatedNote")}</span>
          </span>
        </p>
      )}

      {withData.map((cat) => (
        <section key={cat.id} data-price-category={cat.slug} className="card overflow-hidden">
          <h2 className="card-header section-title">{t(`category.${cat.slug}`)}</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th><T k="rfq.specification" /></th>
                  <th className="text-end"><T k="prices.col.range" /></th>
                  <th className="hidden text-end sm:table-cell"><T k="prices.col.middle" /></th>
                  <th className="hidden lg:table-cell"><T k="desk.col.quantity" /></th>
                  <th className="hidden lg:table-cell"><T k="rfq.deliveryArea" /></th>
                  <th className="hidden text-end md:table-cell"><T k="prices.col.sample" /></th>
                </tr>
              </thead>
              <tbody>
                {groups
                  .filter((g) => g.categorySlug === cat.slug)
                  .map((g) => (
                    <tr key={g.id} data-price-group={g.id}>
                      <td className="max-w-[20rem]">
                        <span className="block font-medium text-slate-900">{specText(cat.slug, g.specLabel)}</span>
                        <span className="block text-xs text-slate-500">
                          {g.deliveryIncluded ? t("prices.deliveryIncluded") : t("prices.deliveryExcluded")}
                          {" · "}
                          {t("prices.period", undefined, { from: formatDate(g.periodStart, lang), to: formatDate(g.periodEnd, lang) })}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-end font-semibold text-slate-900">
                        {t("prices.range", undefined, { p25: formatMoney(g.p25, lang, g.currency), p75: formatMoney(g.p75, lang, g.currency), unit: g.unit })}
                      </td>
                      <td className="hidden whitespace-nowrap text-end sm:table-cell">{formatMoney(g.median, lang, g.currency)}</td>
                      <td className="hidden whitespace-nowrap lg:table-cell">{t("prices.qty", undefined, { band: g.quantityBand, unit: g.unit })}</td>
                      <td className="hidden lg:table-cell">{g.area ?? "—"}</td>
                      <td className="hidden whitespace-nowrap text-end text-slate-500 md:table-cell">
                        {t("prices.basedOn", undefined, { n: formatNumber(g.sampleQuotes, lang), m: formatNumber(g.sampleSuppliers, lang) })}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {!loading && withoutData.length > 0 && (
        <section className="card p-4">
          <h2 className="eyebrow">
            <T k="prices.notEnough" />
          </h2>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {withoutData.map((cat) => (
              <li key={cat.id} data-price-category={cat.slug} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[13px] text-slate-600">
                {t(`category.${cat.slug}`)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
