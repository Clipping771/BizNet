"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { T, useLang, useT } from "@/components/ui/T";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { formatMoney } from "@/lib/money";

export interface OrderAgainItem {
  id: string;
  code: string;
  title: string;
  supplier: string;
  completedAt: string;
  total: number;
  currency?: string;
  /** How far below the highest quote on that request this order was; only when there was a real choice. */
  saved: number | null;
}

/** Packaging runs out every month: repeat a past purchase in one click, from the same supplier or all of them. */
export function OrderAgain({ items }: { items: OrderAgainItem[] }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const reorder = async (item: OrderAgainItem, mode: "PREVIOUS_SUPPLIER_ONLY" | "EVERYONE") => {
    setBusy(item.id);
    setFailed(false);
    const res = await fetch(`/api/orders/${item.id}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    if (json?.code) {
      router.push(`/requests/${json.code}`);
      return;
    }
    setBusy(null);
    setFailed(true);
  };

  return (
    <section id="order-again" className="card overflow-hidden">
      <h2 className="card-header section-title">
        <T k="again.title" />
      </h2>
      {failed && (
        <p role="alert" className="border-b border-slate-100 bg-rose-50 px-4 py-2 text-[13px] text-rose-800">
          <T k="common.tryAgain" />
        </p>
      )}
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} data-order-again={item.code} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
              <p className="truncate text-xs text-slate-500">
                {item.supplier}
                {" · "}
                <span className="font-medium tabular-nums text-slate-700">{formatMoney(item.total, lang, item.currency)}</span>
                {" · "}
                <TimeAgo iso={item.completedAt} />
              </p>
              {item.saved !== null && (
                <p className="mt-0.5 text-xs font-medium text-emerald-700">{t("again.saved", undefined, { amount: formatMoney(item.saved, lang, item.currency) })}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" disabled={busy !== null} onClick={() => reorder(item, "PREVIOUS_SUPPLIER_ONLY")} className="btn btn-primary btn-sm flex-1 sm:flex-none">
                <RotateCcw className="h-3.5 w-3.5" />
                <T k="again.same" />
              </button>
              <button type="button" disabled={busy !== null} onClick={() => reorder(item, "EVERYONE")} className="btn btn-secondary btn-sm flex-1 sm:flex-none">
                <T k="again.everyone" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
