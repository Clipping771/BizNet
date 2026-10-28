"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { T, useLang, useT } from "@/components/ui/T";
import { EmptyState, ListSkeleton, StatusChip } from "@/components/ui/ListStates";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

const TONE: Record<string, "green" | "gray" | "amber" | "red" | "blue"> = {
  SUBMITTED: "blue",
  REVISED: "blue",
  ACCEPTED: "green",
  REJECTED: "gray",
  WITHDRAWN: "gray",
  EXPIRED: "gray",
};

/** A supplier's own quotes with their status and the order they became (§7 /quotes). */
export default function QuotesPage() {
  const t = useT();
  const lang = useLang();
  const [quotes, setQuotes] = useState<any[] | null>(null);

  useEffect(() => {
    fetch("/api/quotes")
      .then((r) => (r.ok ? r.json() : { quotes: [] }))
      .then((d) => setQuotes(d.quotes || []))
      .catch(() => setQuotes([]));
  }, []);

  return (
    <div className="max-w-md mx-auto space-y-4 pb-16">
      <h1 className="text-lg font-bold text-gray-900">
        <T k="quotes.title" />
      </h1>
      {quotes === null ? (
        <ListSkeleton />
      ) : quotes.length === 0 ? (
        <EmptyState k="quotes.empty">
          <Link href="/requests/inbox" className="inline-block px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold">
            <T k="requests.openInbox" />
          </Link>
        </EmptyState>
      ) : (
        <div id="quote-list" className="space-y-2">
          {quotes.map((q) => (
            <Link
              key={q.id}
              href={q.order ? `/orders/${q.order.code}` : `/requests/${q.request.code}`}
              className="block bg-white rounded-2xl border border-gray-100 p-4 space-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{q.request.title}</p>
                <StatusChip k={`quoteStatus.${q.status}`} tone={TONE[q.status] ?? "gray"} />
              </div>
              <p className="text-[11px] text-gray-500">
                {t("quotes.forBuyer", undefined, { name: q.request.buyerBusiness.name, area: q.request.deliveryArea })}
              </p>
              <div className="flex justify-between text-[11px] text-gray-500">
                <span className="text-sm font-bold text-primary">{formatMoney(q.totalPrice, lang)}</span>
                <span>{formatDate(q.updatedAt, lang)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
