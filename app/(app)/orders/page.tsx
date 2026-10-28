"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { T, useLang, useT } from "@/components/ui/T";
import { EmptyState, ListSkeleton, StatusChip } from "@/components/ui/ListStates";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

const TONE: Record<string, "green" | "gray" | "amber" | "red" | "blue"> = {
  CONFIRMED: "blue",
  DISPATCHED: "blue",
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
    <div className="max-w-md mx-auto space-y-4 pb-16">
      <h1 className="text-lg font-bold text-gray-900">
        <T k="orders.title" />
      </h1>
      {orders === null ? (
        <ListSkeleton />
      ) : orders.length === 0 ? (
        <EmptyState k="orders.empty" />
      ) : (
        <div id="order-list" className="space-y-2">
          {orders.map((o) => (
            <Link key={o.id} href={`/orders/${o.code}`} data-order-code={o.code} className="block bg-white rounded-2xl border border-gray-100 p-4 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{o.title}</p>
                <StatusChip k={`order.status.${o.status}`} tone={TONE[o.status] ?? "gray"} />
              </div>
              <p className="text-[11px] text-gray-500">
                {t(o.side === "BUYER" ? "orders.asBuyer" : "orders.asSupplier", undefined, { name: o.otherParty })}
              </p>
              <div className="flex justify-between text-[11px] text-gray-500">
                <span className="font-mono">{o.code}</span>
                <span>{formatDate(o.createdAt, lang)}</span>
              </div>
              {o.total && <p className="text-sm font-bold text-primary">{formatMoney(o.total, lang)}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
