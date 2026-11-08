"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Inbox, ReceiptText, Package, FileText } from "lucide-react";
import { T, useLang, useT } from "@/components/ui/T";
import { EmptyState, ListSkeleton, PageHeader, StatusChip, REQUEST_STATUS_TONE } from "@/components/ui/ListStates";
import { formatDate } from "@/lib/dates";
import { formatNumber } from "@/lib/money";

type Filter = "ALL" | "OPEN" | "AWARDED" | "ENDED";

const FILTERS: { value: Filter; k: string; matches: (status: string) => boolean }[] = [
  { value: "ALL", k: "requests.filter.all", matches: () => true },
  { value: "OPEN", k: "reqStatus.OPEN", matches: (s) => s === "OPEN" },
  { value: "AWARDED", k: "reqStatus.AWARDED", matches: (s) => s === "AWARDED" },
  { value: "ENDED", k: "requests.filter.ended", matches: (s) => s === "CLOSED" || s === "EXPIRED" || s === "CANCELLED" },
];

/** "Requests" tab: the business's own requests as a filterable table, plus phone shortcuts (§7). */
export default function RequestsPage() {
  const t = useT();
  const router = useRouter();
  const lang = useLang();
  const [requests, setRequests] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");

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
  const active = FILTERS.find((f) => f.value === filter)!;
  const shown = (requests ?? []).filter((r) => active.matches(r.status));

  return (
    <div className="page-wide space-y-4">
      <PageHeader titleKey="requests.mine">
        <Link href="/requests/new" id="new-request-link" className="btn btn-primary hidden sm:inline-flex">
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          <T k="home.newRequest" />
        </Link>
      </PageHeader>

      {/* The sidebar carries these from md up */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none md:hidden">
        {shortcuts.map(({ href, icon: Icon, k, id }) => (
          <Link key={href} href={href} id={id} className="btn btn-secondary btn-sm shrink-0">
            <Icon className="h-4 w-4 text-primary-700" />
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
        <div className="card overflow-hidden">
          <div role="tablist" aria-label={t("requests.mine")} className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2 scrollbar-none">
            {FILTERS.map((f) => {
              const count = requests.filter((r) => f.matches(r.status)).length;
              const selected = f.value === filter;
              return (
                <button
                  key={f.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setFilter(f.value)}
                  className={`-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors ${
                    selected ? "border-primary-700 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <T k={f.k} />
                  <span className="text-xs tabular-nums text-slate-500">{formatNumber(count, lang)}</span>
                </button>
              );
            })}
          </div>
          {shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              <T k="requests.filter.none" />
            </p>
          ) : (
            <div id="my-requests" className="table-wrap">
              <table className="data-table table-stack">
                <thead>
                  <tr>
                    <th><T k="desk.col.request" /></th>
                    <th className="hidden md:table-cell"><T k="listing.category" /></th>
                    <th className="hidden sm:table-cell"><T k="desk.col.quantity" /></th>
                    <th><T k="desk.col.quotes" /></th>
                    <th><T k="desk.col.status" /></th>
                    <th className="hidden lg:table-cell"><T k="desk.col.date" /></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} data-request-code={r.code} onClick={() => router.push(`/requests/${r.code}`)} className="cursor-pointer">
                      <td className="max-w-[20rem]">
                        <Link href={`/requests/${r.code}`} className="block truncate font-medium text-slate-900 hover:text-primary-700">
                          {r.title}
                        </Link>
                        <span className="text-xs text-slate-500">{r.code}</span>
                      </td>
                      <td className="hidden whitespace-nowrap md:table-cell">{t(`category.${r.category?.slug}`)}</td>
                      <td className="hidden whitespace-nowrap sm:table-cell">
                        {formatNumber(Number(r.quantity), lang)} {r.unit}
                      </td>
                      <td>
                        <span className="sm:hidden">{t("desk.quotesShort", undefined, { n: formatNumber(r._count?.quotes ?? 0, lang) })}</span>
                        <span className="hidden sm:inline">{formatNumber(r._count?.quotes ?? 0, lang)}</span>
                      </td>
                      <td><StatusChip k={`reqStatus.${r.status}`} tone={REQUEST_STATUS_TONE[r.status] ?? "gray"} /></td>
                      <td className="hidden whitespace-nowrap text-slate-500 lg:table-cell">{formatDate(r.createdAt, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
