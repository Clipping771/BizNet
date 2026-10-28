"use client";

import { useEffect, useState } from "react";
import { T, useT, useLang } from "@/components/ui/T";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";

interface PriceGroup {
  id: string;
  categorySlug: string;
  specLabel: Record<string, unknown>;
  unit: string;
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

  useEffect(() => {
    Promise.all([fetch("/api/prices").then((r) => r.json()), fetch("/api/categories").then((r) => r.json())])
      .then(([p, c]) => {
        setGroups(p.groups || []);
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

  return (
    <div className="page space-y-4">
      <div className="space-y-1">
        <h1 className="page-title">
          <T k="prices.title" />
        </h1>
        <p className="text-xs text-gray-500">
          <T k="prices.subtitle" />
        </p>
      </div>

      {!loading &&
        categories.map((cat) => {
          const own = groups.filter((g) => g.categorySlug === cat.slug);
          return (
            <section key={cat.id} data-price-category={cat.slug} className="space-y-2">
              <h2 className="text-sm font-bold text-gray-800">{t(`category.${cat.slug}`)}</h2>
              {own.length === 0 && (
                <p className="text-xs text-gray-400 card p-3">
                  <T k="prices.notEnough" />
                </p>
              )}
              {own.map((g) => (
                <div key={g.id} data-price-group={g.id} className="card p-4 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-800">{specText(cat.slug, g.specLabel)}</p>
                  <p className="text-base font-bold text-primary">
                    {t("prices.range", undefined, {
                      p25: formatMoney(g.p25, lang),
                      p75: formatMoney(g.p75, lang),
                      unit: g.unit,
                    })}
                  </p>
                  <p className="text-xs text-gray-600">{t("prices.median", undefined, { median: formatMoney(g.median, lang) })}</p>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>{t("prices.qty", undefined, { band: g.quantityBand, unit: g.unit })}</span>
                    <span>{g.deliveryIncluded ? t("prices.deliveryIncluded") : t("prices.deliveryExcluded")}</span>
                    {g.area && <span>{g.area}</span>}
                    <span>
                      {t("prices.period", undefined, { from: formatDate(g.periodStart, lang), to: formatDate(g.periodEnd, lang) })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {t("prices.basedOn", undefined, { n: g.sampleQuotes, m: g.sampleSuppliers })}
                  </p>
                </div>
              ))}
            </section>
          );
        })}
    </div>
  );
}
