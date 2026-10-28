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
        <Link href="/requests/new" id="new-request-link" className="btn btn-primary hidden sm:inline-flex">
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          <T k="home.newRequest" />
        </Link>
      </PageHeader>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
        {shortcuts.map(({ href, icon: Icon, k, id }) => (
          <Link
            key={href}
            href={href}
            id={id}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            <Icon className="h-[18px] w-[18px] text-primary-700" />
            <T k={k} />
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
