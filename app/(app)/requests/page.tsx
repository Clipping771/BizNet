"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusCircle, Inbox, FileText, Package } from "lucide-react";
import { T, useLang, useT } from "@/components/ui/T";
import { EmptyState, ListSkeleton, StatusChip } from "@/components/ui/ListStates";
import { formatDate } from "@/lib/dates";
import { formatNumber } from "@/lib/money";

const STATUS_TONE: Record<string, "green" | "gray" | "amber" | "red" | "blue"> = {
  OPEN: "green",
  AWARDED: "blue",
  CLOSED: "gray",
  EXPIRED: "gray",
  CANCELLED: "red",
};

/** "Requests" tab: the business's own requests, plus shortcuts for suppliers (§7). */
export default function RequestsPage() {
  const t = useT();
  const lang = useLang();
  const [requests, setRequests] = useState<any[] | null>(null);

  useEffect(() => {
    fetch("/api/requests")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRequests(Array.isArray(d) ? d : []))
      .catch(() => setRequests([]));
  }, []);

  return (
    <div className="max-w-md mx-auto space-y-4 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">
          <T k="requests.mine" />
        </h1>
        <Link
          href="/requests/new"
          id="new-request-link"
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white text-xs font-semibold rounded-lg shadow-sm"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <T k="home.newRequest" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <Link href="/requests/inbox" className="bg-white rounded-xl border border-gray-100 p-3 flex flex-col items-center gap-1 text-gray-700">
          <Inbox className="w-4 h-4 text-primary" />
          <T k="requests.openInbox" />
        </Link>
        <Link href="/quotes" className="bg-white rounded-xl border border-gray-100 p-3 flex flex-col items-center gap-1 text-gray-700">
          <FileText className="w-4 h-4 text-primary" />
          <T k="requests.myQuotes" />
        </Link>
        <Link href="/orders" id="orders-link" className="bg-white rounded-xl border border-gray-100 p-3 flex flex-col items-center gap-1 text-gray-700">
          <Package className="w-4 h-4 text-primary" />
          <T k="requests.myOrders" />
        </Link>
      </div>

      {requests === null ? (
        <ListSkeleton />
      ) : requests.length === 0 ? (
        <EmptyState k="requests.emptyBuyer">
          <Link href="/requests/new" className="inline-block px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold">
            <T k="home.newRequest" />
          </Link>
        </EmptyState>
      ) : (
        <div id="my-requests" className="space-y-2">
          {requests.map((r) => (
            <Link key={r.id} href={`/requests/${r.code}`} data-request-code={r.code} className="block bg-white rounded-2xl border border-gray-100 p-4 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                <StatusChip k={`reqStatus.${r.status}`} tone={STATUS_TONE[r.status] ?? "gray"} />
              </div>
              <p className="text-[11px] text-gray-500">
                {t(`category.${r.category?.slug}`)}
                {" · "}
                {formatDate(r.createdAt, lang)}
              </p>
              <p className="text-[11px] text-gray-600">
                {t("requests.counts", undefined, { quotes: formatNumber(r._count?.quotes ?? 0, lang), invites: formatNumber(r._count?.invites ?? 0, lang) })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
