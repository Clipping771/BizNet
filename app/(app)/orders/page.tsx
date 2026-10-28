"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useLang, useT } from "@/components/ui/T";
import { EmptyState, ListSkeleton, PageHeader, StatusChip, type Tone } from "@/components/ui/ListStates";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

const TONE: Record<string, Tone> = {
  CONFIRMED: "blue",
  DISPATCHED: "violet",
  DELIVERED: "amber",
  COMPLETED: "green",
  CANCELLED: "red",
  DISPUTED: "amber",
};

/** All orders of the active business, as buyer or supplier (§7 /orders). */
export default function OrdersPage() {
  const t = useT();
  const lang = useLang();
  const [orders, setOrders] = useState<any[] | null>(null);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => (r.ok ? r.json() : { orders: [] }))
      .then((d) => setOrders(d.orders || []))
      .catch(() => setOrders([]));
  }, []);

  return (
    <div className="page space-y-5">
      <PageHeader titleKey="orders.title" />
      {orders === null ? (
        <ListSkeleton />
      ) : orders.length === 0 ? (
        <EmptyState k="orders.empty" icon={Package} />
      ) : (
        <div id="order-list" className="space-y-2.5">
          {orders.map((o) => {
            const SideIcon = o.side === "BUYER" ? ArrowDownLeft : ArrowUpRight;
            return (
              <Link key={o.id} href={`/orders/${o.code}`} data-order-code={o.code} className="card card-link flex items-start gap-3.5 p-4">
                <span className={`icon-tile ${o.side === "BUYER" ? "" : "bg-sky-50 text-sky-700"}`}>
                  <SideIcon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{o.title}</p>
                    <StatusChip k={`order.status.${o.status}`} tone={TONE[o.status] ?? "gray"} />
                  </div>
                  <p className="text-xs text-gray-500">
                    {t(o.side === "BUYER" ? "orders.asBuyer" : "orders.asSupplier", undefined, { name: o.otherParty })}
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {o.total ? <span className="text-sm font-bold tabular-nums text-gray-900">{formatMoney(o.total, lang)}</span> : <span />}
                    <span className="text-xs text-gray-400">
                      <span className="font-mono">{o.code}</span>
                      {" · "}
                      {formatDate(o.createdAt, lang)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
