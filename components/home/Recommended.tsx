"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "@phosphor-icons/react";
import { T, useT } from "@/components/ui/T";
import { MoneyRange } from "@/components/ui/Num";
import { CategoryVisual } from "@/components/ui/CategoryVisual";

export interface RecommendedItem {
  id: string;
  title: string;
  supplier: string;
  categorySlug: string;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  reasonKey: string;
  reasonParam?: string;
}

function track(name: "listing_click" | "dismiss_recommendation", item: RecommendedItem) {
  // Telemetry never blocks or breaks the page
  fetch("/api/telemetry/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, props: { listingId: item.id, categorySlug: item.categorySlug } }),
  }).catch(() => {});
}

/** Compact recommended products; "hide" feeds back into the recommender through the dismiss event. */
export function Recommended({ items }: { items: RecommendedItem[] }) {
  const t = useT();
  const [hidden, setHidden] = useState<string[]>([]);
  const shown = items.filter((i) => !hidden.includes(i.id));
  if (shown.length === 0) return null;

  return (
    <section className="card">
      <h2 className="card-header section-title">
        <T k="algo.badge" />
      </h2>
      <ul className="divide-y divide-slate-100">
        {shown.map((item) => (
          <li key={item.id} className="group flex items-start gap-3 px-4 py-3">
            <CategoryVisual slug={item.categorySlug} size={20} className="h-10 w-10 rounded-lg" />
            <Link href={`/l/${item.id}`} onClick={() => track("listing_click", item)} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900 group-hover:text-primary-700">{item.title}</span>
              <span className="block truncate text-xs text-slate-500">{item.supplier}</span>
              {item.priceMin !== null && (
                <span className="mt-1 block text-[13px] font-medium tabular-nums text-slate-800">
                  <MoneyRange min={item.priceMin} max={item.priceMax} currency={item.currency} />
                </span>
              )}
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                <T k={item.reasonKey} params={item.reasonParam ? { param: item.reasonParam } : undefined} />
              </span>
            </Link>
            <button
              type="button"
              aria-label={t("algo.dismiss")}
              title={t("algo.dismiss")}
              onClick={() => {
                setHidden((h) => [...h, item.id]);
                track("dismiss_recommendation", item);
              }}
              className="-me-1.5 -mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
