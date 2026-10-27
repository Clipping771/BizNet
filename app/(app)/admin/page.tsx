"use client";

import { useCallback, useEffect, useState } from "react";
import { T, useT } from "@/components/ui/T";
import { adminFetch } from "@/components/admin/AdminNav";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function format(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) {
    return value.map((v: any) => (v.field ? `${v.field} (${v.count})` : v.activity ? `${v.activity}: ${v.minutes}` : JSON.stringify(v))).join(", ") || "—";
  }
  if (typeof value === "object") return "";
  return String(value);
}

/** §13 metrics dashboard: date range, each funnel step separately, thresholds, CSV export. */
export default function AdminDashboardPage() {
  const t = useT();
  const today = new Date();
  const [from, setFrom] = useState(iso(new Date(today.getTime() - 27 * 86400000)));
  const [to, setTo] = useState(iso(today));
  const [metrics, setMetrics] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await adminFetch(`/api/admin/metrics?from=${from}&to=${to}`);
    if (res.ok) setMetrics(res.data);
    else setError(res.status === 403 ? t("admin.forbidden") : res.error);
  }, [from, to, t]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const section = (titleKey: string, data: Record<string, unknown>, id: string) => (
    <section id={id} className="bg-white rounded-2xl border border-gray-100 p-4">
      <h2 className="text-sm font-bold text-gray-900 mb-2">
        <T k={titleKey} />
      </h2>
      <dl className="divide-y divide-gray-50 text-xs">
        {Object.entries(data)
          .filter(([key]) => key !== "latestEval")
          .map(([key, value]) => (
            <div key={key} data-metric={key} className="flex justify-between gap-3 py-1.5">
              <dt className="text-gray-600">{t(`metric.${key}`)}</dt>
              <dd className="font-semibold text-gray-900 text-end">{format(value)}</dd>
            </div>
          ))}
      </dl>
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-end gap-2 text-xs">
        <label className="space-y-1">
          <span className="block text-gray-500">
            <T k="admin.from" />
          </span>
          <input id="metrics-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="p-2 rounded-lg border border-gray-200" />
        </label>
        <label className="space-y-1">
          <span className="block text-gray-500">
            <T k="admin.to" />
          </span>
          <input id="metrics-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="p-2 rounded-lg border border-gray-200" />
        </label>
        <button type="button" id="metrics-apply" onClick={load} className="px-4 py-2 rounded-lg bg-gray-900 text-white font-semibold">
          <T k="admin.apply" />
        </button>
        <a href={`/api/admin/metrics/export?from=${from}&to=${to}`} id="metrics-csv" className="px-4 py-2 rounded-lg border border-gray-200 font-semibold text-gray-700">
          <T k="admin.downloadCsv" />
        </a>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {metrics && (
        <>
          <section id="metrics-thresholds" className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-bold text-gray-900 mb-2">
              <T k="admin.section.thresholds" />
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(metrics.thresholds as Record<string, any>).map(([key, th]) => (
                <div
                  key={key}
                  data-threshold={key}
                  data-status={th.status}
                  className={`rounded-xl p-3 text-xs border ${
                    th.status === "green" ? "bg-emerald-50 border-emerald-200" : th.status === "red" ? "bg-rose-50 border-rose-200" : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <p className="text-gray-600">{t(`metric.${key}`)}</p>
                  <p className="text-base font-bold text-gray-900">{format(th.value)}</p>
                  <p className="text-gray-500">{t("admin.target", undefined, { target: th.target })}</p>
                </div>
              ))}
            </div>
          </section>
          {section("admin.section.funnel", metrics.funnel, "metrics-funnel")}
          {section("admin.section.ai", metrics.ai, "metrics-ai")}
          <section className="bg-white rounded-2xl border border-gray-100 p-4 text-xs">
            <h2 className="text-sm font-bold text-gray-900 mb-1">
              <T k="admin.section.eval" />
            </h2>
            {metrics.ai.latestEval ? (
              <p>
                {t("admin.evalLine", undefined, {
                  cat: metrics.ai.latestEval.categoryAccuracy,
                  field: metrics.ai.latestEval.fieldAccuracy,
                  date: metrics.ai.latestEval.receivedAt.slice(0, 10),
                })}
              </p>
            ) : (
              <p className="text-gray-500">
                <T k="admin.noEval" />
              </p>
            )}
          </section>
          {section("admin.section.ops", metrics.ops, "metrics-ops")}
          {section("admin.section.health", metrics.health, "metrics-health")}
        </>
      )}
    </div>
  );
}
