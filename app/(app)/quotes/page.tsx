"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReceiptText, Inbox } from "lucide-react";
import { T, useLang, useT } from "@/components/ui/T";
import { EmptyState, ListSkeleton, PageHeader, StatusChip, type Tone } from "@/components/ui/ListStates";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

const TONE: Record<string, Tone> = {
  SUBMITTED: "blue",
  REVISED: "violet",
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
    <div className="page space-y-5">
      <PageHeader titleKey="quotes.title">
        <Link href="/requests/inbox" className="btn btn-secondary btn-sm">
          <Inbox className="h-3.5 w-3.5" />
          <T k="requests.openInbox" />
        </Link>
      </PageHeader>
      {quotes === null ? (
        <ListSkeleton />
      ) : quotes.length === 0 ? (
        <EmptyState k="quotes.empty" icon={ReceiptText}>
          <Link href="/requests/inbox" className="btn btn-primary btn-sm">
            <T k="requests.openInbox" />
          </Link>
        </EmptyState>
      ) : (
        <div id="quote-list" className="space-y-2.5">
          {quotes.map((q) => (
            <Link
              key={q.id}
              href={q.order ? `/orders/${q.order.code}` : `/requests/${q.request.code}`}
              className="card card-link flex items-start gap-3.5 p-4"
            >
              <span className="icon-tile">
                <ReceiptText className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{q.request.title}</p>
                  <StatusChip k={`quoteStatus.${q.status}`} tone={TONE[q.status] ?? "gray"} />
                </div>
                <p className="text-xs text-gray-500">
                  {t("quotes.forBuyer", undefined, { name: q.request.buyerBusiness.name, area: q.request.deliveryArea })}
                </p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-sm font-bold tabular-nums text-gray-900">{formatMoney(q.totalPrice, lang)}</span>
                  <span className="text-xs text-gray-400">{formatDate(q.updatedAt, lang)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
