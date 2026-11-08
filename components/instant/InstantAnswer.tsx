"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { T, useLang, useT } from "@/components/ui/T";
import { VerificationBadge } from "@/components/business/VerificationBadge";
import { formatMoney, formatNumber } from "@/lib/money";
import type { InstantAnswer as Answer } from "@/lib/repo/instant";

const EXAMPLES = ["instant.example1", "instant.example2", "instant.example3"];
const DEBOUNCE_MS = 300;

function requestHref(need: string, supplier?: { id: string; name: string }) {
  const params = new URLSearchParams({ need });
  if (supplier) {
    params.set("supplier", supplier.id);
    params.set("supplierName", supplier.name);
  }
  return `/requests/new?${params}`;
}

/**
 * Type a need, see real suppliers and real prices straight away, then ask them all with one click.
 * `placeholder` shows while nothing is typed.
 */
export function InstantAnswer({ placeholder }: { placeholder?: React.ReactNode }) {
  const t = useT();
  const lang = useLang();
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);
  const query = text.trim();

  useEffect(() => {
    const run = ++latest.current;
    if (query.length < 2) {
      setAnswer(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/instant?q=${encodeURIComponent(query)}`).catch(() => null);
      const json = res?.ok ? await res.json().catch(() => null) : null;
      // A slower older answer must not replace a newer one
      if (run !== latest.current) return;
      setAnswer(json);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const track = () => {
    fetch("/api/telemetry/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "instant_cta", props: { suppliers: answer?.listings.length ?? 0, hasPrice: !!answer?.price } }),
    }).catch(() => {});
  };

  const quantity = answer?.quantity ?? null;
  const price = answer?.price ?? null;
  const moneyTotal = (unit: number, currency?: string) => formatMoney(unit * (quantity ?? 0), lang, currency);

  return (
    <div className="space-y-3 text-slate-900">
      <div className="relative">
        <Sparkles aria-hidden="true" className="pointer-events-none absolute start-[18px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-amber-500" />
        <input
          id="instant-input"
          type="text"
          value={text}
          maxLength={200}
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          placeholder={t("desk.prompt")}
          aria-label={t("desk.prompt")}
          className="h-14 w-full rounded-2xl border border-slate-200 bg-white pe-4 ps-12 text-base shadow-card placeholder:text-slate-400 hover:border-primary-300"
        />
      </div>

      {!query && (
        <div className="flex flex-wrap items-center gap-1.5">
          {EXAMPLES.map((k) => (
            <button key={k} type="button" onClick={() => setText(t(k))} className="min-h-9 rounded-full border border-slate-200/80 bg-white px-3.5 py-1 text-[13px] font-medium text-slate-600 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700">
              {t(k)}
            </button>
          ))}
        </div>
      )}

      {!query && placeholder}

      {query.length >= 2 && (
        <section id="instant-answer" aria-live="polite" aria-busy={loading} className={`card overflow-hidden transition-opacity ${loading ? "opacity-60" : ""}`}>
          {price && (
            <div id="instant-price" className="border-b border-slate-100 bg-gradient-to-r from-primary-50 to-white px-4 py-3.5">
              <p className="eyebrow">
                <T k="instant.usualPrice" />
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                {t("prices.range", undefined, { p25: formatMoney(price.p25, lang, price.currency), p75: formatMoney(price.p75, lang, price.currency), unit: price.unit })}
              </p>
              {quantity !== null && (
                <p id="instant-total" className="mt-0.5 text-sm font-medium text-slate-700">
                  {t("instant.forQuantity", undefined, {
                    quantity: formatNumber(quantity, lang),
                    unit: price.unit,
                    low: moneyTotal(price.p25, price.currency),
                    high: moneyTotal(price.p75, price.currency),
                  })}
                </p>
              )}
              <p className="mt-0.5 text-xs text-slate-500">
                {t("prices.basedOn", undefined, { n: formatNumber(price.sampleQuotes, lang), m: formatNumber(price.sampleSuppliers, lang) })}
                {" · "}
                {price.deliveryIncluded ? t("prices.deliveryIncluded") : t("prices.deliveryExcluded")}
              </p>
            </div>
          )}

          {answer && answer.listings.length > 0 && (
            <>
              <h3 className="px-4 pt-3 text-[13px] font-medium text-slate-500">
                <T k={answer.exact ? "instant.suppliersExact" : "instant.suppliersNear"} />
              </h3>
              <ul className="divide-y divide-slate-100">
                {answer.listings.map((l) => (
                  <li key={l.id} data-instant-supplier={l.businessName} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link href={`/b/${l.businessSlug}`} className="text-sm font-semibold text-slate-900 hover:text-primary-700">
                          {l.businessName}
                        </Link>
                        <VerificationBadge status={l.verificationStatus as any} />
                      </div>
                      <Link href={`/l/${l.id}`} className="mt-0.5 block truncate text-[13px] text-slate-600 hover:text-primary-700">
                        {l.title} · {l.businessArea}
                      </Link>
                      {quantity !== null && l.moq !== null && quantity < l.moq && (
                        <p className="mt-0.5 text-xs font-medium text-amber-700">{t("instant.belowMoq", undefined, { moq: formatNumber(l.moq, lang), unit: l.unit })}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                      {l.priceMin && (
                        <p className="text-sm font-semibold tabular-nums text-slate-900 sm:text-end">
                          {t("prices.range", undefined, { p25: formatMoney(l.priceMin, lang, l.currency), p75: formatMoney(l.priceMax ?? l.priceMin, lang, l.currency), unit: l.unit })}
                        </p>
                      )}
                      <Link href={requestHref(query, { id: l.businessId, name: l.businessName })} onClick={track} className="btn btn-secondary btn-sm shrink-0">
                        <T k="search.requestQuote" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {answer && answer.listings.length === 0 && !loading && (
            <p id="instant-none" className="px-4 py-4 text-sm text-slate-600">
              <T k="instant.none" />
            </p>
          )}

          {answer && (
            <div className="border-t border-slate-100 p-3">
              <Link id="instant-cta" href={requestHref(query)} onClick={track} className="btn btn-primary w-full">
                <T k={answer.listings.length > 1 ? "instant.askAll" : "instant.ask"} />
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
