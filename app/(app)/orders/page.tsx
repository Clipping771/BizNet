"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { T, useLang, useT } from "@/components/ui/T";
import { EmptyState, ListSkeleton, ORDER_STATUS_TONE, PageHeader, StatusChip } from "@/components/ui/ListStates";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/** All orders of the active business, as buyer or supplier (§7 /orders). */
export default function OrdersPage() {
  const t = useT();
  const router = useRouter();
  const lang = useLang();
  const [orders, setOrders] = useState<any[] | null>(null);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => (r.ok ? r.json() : { orders: [] }))
      .then((d) => setOrders(d.orders || []))
      .catch(() => setOrders([]));
  }, []);

  return (
    <div className="page-wide space-y-4">
      <PageHeader titleKey="orders.title" />
      {orders === null ? (
        <ListSkeleton />
      ) : orders.length === 0 ? (
        <EmptyState k="orders.empty" icon={Package}>
          <Link href="/requests/new" className="btn btn-primary btn-sm">
            <T k="home.newRequest" />
          </Link>
        </EmptyState>
      ) : (
        <div id="order-list" className="card table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th><T k="desk.col.order" /></th>
                <th className="hidden sm:table-cell"><T k="desk.col.party" /></th>
                <th className="text-end"><T k="orders.col.total" /></th>
                <th><T k="desk.col.status" /></th>
                <th className="hidden lg:table-cell"><T k="desk.col.date" /></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const SideIcon = o.side === "BUYER" ? ArrowDownLeft : ArrowUpRight;
                return (
                  <tr key={o.id} data-order-code={o.code} onClick={() => router.push(`/orders/${o.code}`)} className="cursor-pointer">
                    <td className="max-w-[20rem]">
                      <Link href={`/orders/${o.code}`} className="block truncate font-medium text-slate-900 hover:text-primary-700">
                        {o.title}
                      </Link>
                      <span className="text-xs text-slate-500">{o.code}</span>
                    </td>
                    <td className="hidden sm:table-cell">
                      <span className="flex items-center gap-1.5">
                        <SideIcon className={`h-3.5 w-3.5 shrink-0 ${o.side === "BUYER" ? "text-primary-600" : "text-emerald-600"}`} />
                        <span className="truncate">{t(o.side === "BUYER" ? "orders.asBuyer" : "orders.asSupplier", undefined, { name: o.otherParty })}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-end font-semibold text-slate-900">{o.total ? formatMoney(o.total, lang, o.currency) : "—"}</td>
                    <td><StatusChip k={`order.status.${o.status}`} tone={ORDER_STATUS_TONE[o.status] ?? "gray"} /></td>
                    <td className="hidden whitespace-nowrap text-slate-500 lg:table-cell">{formatDate(o.createdAt, lang)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
