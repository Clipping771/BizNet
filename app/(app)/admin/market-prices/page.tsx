"use client";

import { useCallback, useEffect, useState } from "react";
import { T, useT } from "@/components/ui/T";
import { adminFetch } from "@/components/admin/AdminNav";

/** Market-price review: all groups of the latest run, exclusions, recompute (§8.15). */
export default function AdminMarketPricesPage() {
  const t = useT();
  const [groups, setGroups] = useState<any[]>([]);
  const [exclusions, setExclusions] = useState<any[]>([]);
  const [quoteId, setQuoteId] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [g, e] = await Promise.all([adminFetch("/api/admin/market-prices"), adminFetch("/api/admin/market-prices/exclusions/list")]);
    if (g.ok) setGroups(g.data.groups);
    else setMessage(g.status === 403 ? t("admin.forbidden") : g.error);
    if (e.ok) setExclusions(e.data.exclusions);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const recompute = async () => {
    const res = await adminFetch("/api/admin/market-prices/recompute", { method: "POST" });
    setMessage(res.ok ? t("admin.saved") : res.error);
    await load();
  };

  const exclude = async () => {
    const res = await adminFetch("/api/admin/market-prices/exclusions", { method: "POST", body: JSON.stringify({ quoteId: quoteId.trim(), reason }) });
    setMessage(res.ok ? t("admin.saved") : res.error);
    if (res.ok) {
      setQuoteId("");
      setReason("");
      await load();
    }
  };

  return (
    <div className="space-y-3">
      <button type="button" id="prices-recompute" onClick={recompute} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold">
        <T k="admin.prices.recompute" />
      </button>
      {message && <p className="text-sm text-gray-700">{message}</p>}

      <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 text-xs">
        <h2 className="text-sm font-bold text-gray-900">
          <T k="admin.prices.groups" />
        </h2>
        {groups.map((g) => (
          <div key={g.id} className="border border-gray-100 rounded-xl p-3 space-y-1">
            <div className="flex justify-between gap-2">
              <span className="font-semibold">{t(`category.${g.category.slug}`)}</span>
              <span className={g.isPublishable ? "text-emerald-700 font-semibold" : "text-gray-500"}>
                {g.isPublishable ? t("admin.prices.publishable") : t("admin.prices.notPublishable")}
              </span>
            </div>
            <p className="font-mono text-gray-500 break-all">{g.specKey}</p>
            <p>
              {[[g.p25, g.median, g.p75].join(" – "), g.unit, g.quantityBand, g.area].filter(Boolean).join(" · ")}
            </p>
            <p className="text-gray-500">
              {t("prices.basedOn", undefined, { n: g.sampleQuotes, m: g.sampleSuppliers })}
              {" · "}
              {t("admin.prices.excluded", undefined, { n: g.excludedCount })}
            </p>
          </div>
        ))}
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 text-xs">
        <h2 className="text-sm font-bold text-gray-900">
          <T k="admin.prices.excludeQuote" />
        </h2>
        <input value={quoteId} onChange={(e) => setQuoteId(e.target.value)} placeholder={t("admin.prices.quoteId")} aria-label={t("admin.prices.quoteId")} className="w-full p-2 rounded-lg border border-gray-200 font-mono" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("admin.prices.reason")} aria-label={t("admin.prices.reason")} className="w-full p-2 rounded-lg border border-gray-200" />
        <button type="button" onClick={exclude} disabled={!quoteId.trim() || !reason.trim()} className="px-3 py-2 rounded-lg border border-rose-300 text-rose-700 font-semibold disabled:opacity-50">
          <T k="admin.save" />
        </button>
        <h3 className="font-bold text-gray-700 pt-2">
          <T k="admin.prices.exclusions" />
        </h3>
        {exclusions.map((x) => (
          <p key={x.id} className="text-gray-600">
            {[x.quote.request.code, x.quote.supplierBusiness.name, x.quote.unitPrice, x.reason].join(" · ")}
          </p>
        ))}
      </section>
    </div>
  );
}
