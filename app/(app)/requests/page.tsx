"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Inbox, ReceiptText, Package, FileText, ChevronRight } from "lucide-react";
import { T, useLang, useT } from "@/components/ui/T";
import { EmptyState, ListSkeleton, PageHeader, StatusChip, REQUEST_STATUS_TONE } from "@/components/ui/ListStates";
import { formatDate } from "@/lib/dates";
import { formatNumber } from "@/lib/money";

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

  const shortcuts = [
    { href: "/requests/inbox", icon: Inbox, k: "requests.openInbox" },
    { href: "/quotes", icon: ReceiptText, k: "requests.myQuotes" },
    { href: "/orders", icon: Package, k: "requests.myOrders", id: "orders-link" },
  ];

  return (
    <div className="page space-y-5">
      <PageHeader titleKey="requests.mine">
        <Link href="/requests/new" id="new-request-link" className="btn btn-primary btn-sm sm:h-10 sm:px-4 sm:text-sm">
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          <T k="home.newRequest" />
        </Link>
      </PageHeader>

      <div className="grid grid-cols-3 gap-2.5">
        {shortcuts.map(({ href, icon: Icon, k, id }) => (
          <Link key={href} href={href} id={id} className="card card-link flex flex-col items-center gap-2 px-2 py-3.5 text-center sm:flex-row sm:px-4 sm:text-start">
            <span className="icon-tile h-9 w-9">
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold leading-tight text-gray-800 sm:text-sm">
              <T k={k} />
            </span>
          </Link>
        ))}
      </div>

      {requests === null ? (
        <ListSkeleton />
      ) : requests.length === 0 ? (
        <EmptyState k="requests.emptyBuyer" icon={FileText}>
          <Link href="/requests/new" className="btn btn-primary btn-sm">
            <Plus className="h-3.5 w-3.5" />
            <T k="home.newRequest" />
          </Link>
        </EmptyState>
      ) : (
        <div id="my-requests" className="space-y-2.5">
          {requests.map((r) => (
            <Link key={r.id} href={`/requests/${r.code}`} data-request-code={r.code} className="card card-link group flex items-center gap-3.5 p-4">
              <span className="icon-tile hidden sm:flex">
                <FileText className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                  <StatusChip k={`reqStatus.${r.status}`} tone={REQUEST_STATUS_TONE[r.status] ?? "gray"} />
                </div>
                <p className="text-xs text-gray-500">
                  {t(`category.${r.category?.slug}`)}
                  {" · "}
                  {formatDate(r.createdAt, lang)}
                </p>
                <p className="text-xs font-medium text-gray-600">
                  {t("requests.counts", undefined, { quotes: formatNumber(r._count?.quotes ?? 0, lang), invites: formatNumber(r._count?.invites ?? 0, lang) })}
                </p>
              </div>
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-gray-300 transition group-hover:text-gray-500 sm:block rtl:rotate-180" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
