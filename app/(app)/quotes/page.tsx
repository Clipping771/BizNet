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
    <div className="page-wide space-y-4">
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
        <div id="quote-list" className="card table-wrap">
          <table className="data-table table-stack">
            <thead>
              <tr>
                <th><T k="desk.col.request" /></th>
                <th className="hidden sm:table-cell"><T k="desk.col.party" /></th>
                <th className="text-end"><T k="orders.col.total" /></th>
                <th><T k="desk.col.status" /></th>
                <th className="hidden lg:table-cell"><T k="quotes.col.updated" /></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td className="max-w-[20rem]">
                    <Link href={q.order ? `/orders/${q.order.code}` : `/requests/${q.request.code}`} className="block truncate font-medium text-slate-900 hover:text-primary-700">
                      {q.request.title}
                    </Link>
                  </td>
                  <td className="hidden sm:table-cell">{t("quotes.forBuyer", undefined, { name: q.request.buyerBusiness.name, area: q.request.deliveryArea })}</td>
                  <td className="whitespace-nowrap text-end font-semibold text-slate-900">{formatMoney(q.totalPrice, lang, q.currency)}</td>
                  <td><StatusChip k={`quoteStatus.${q.status}`} tone={TONE[q.status] ?? "gray"} /></td>
                  <td className="hidden whitespace-nowrap text-slate-500 lg:table-cell">{formatDate(q.updatedAt, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
