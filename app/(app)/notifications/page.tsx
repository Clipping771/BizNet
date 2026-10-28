"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { T, useLang, useT } from "@/components/ui/T";
import { EmptyState, ListSkeleton } from "@/components/ui/ListStates";
import { formatDate } from "@/lib/dates";

/** In-app notifications (§7 /notifications): newest first; opening one marks it read. */
export default function NotificationsPage() {
  const t = useT();
  const lang = useLang();
  const [items, setItems] = useState<any[] | null>(null);

  const load = () =>
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : { notifications: [] }))
      .then((d) => setItems(d.notifications || []))
      .catch(() => setItems([]));

  useEffect(() => {
    load();
  }, []);

  const markRead = async (ids?: string[]) => {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids ? { ids } : {}),
    });
  };

  const text = (n: any) => {
    const p = n.params || {};
    const code = p.requestCode || p.orderCode || "";
    const status = p.status ? t(`order.status.${p.status}`) : "";
    const key = `notif.${n.type}`;
    const message = t(key, undefined, { code, status });
    return message === key ? t("notif.generic") : message;
  };

  return (
    <div className="max-w-md mx-auto space-y-4 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">
          <T k="notifications.title" />
        </h1>
        {items && items.some((n) => !n.readAt) && (
          <button
            type="button"
            id="notifications-mark-all"
            onClick={async () => {
              await markRead();
              await load();
            }}
            className="text-xs font-semibold text-primary py-2"
          >
            <T k="notifications.markAll" />
          </button>
        )}
      </div>
      {items === null ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState k="notifications.empty" />
      ) : (
        <div id="notification-list" className="space-y-2">
          {items.map((n) => (
            <Link
              key={n.id}
              href={n.link || "/home"}
              data-notification={n.type}
              data-read={n.readAt ? "true" : "false"}
              onClick={() => {
                if (!n.readAt) markRead([n.id]);
              }}
              className={`block rounded-2xl border p-4 space-y-1 ${n.readAt ? "bg-white border-gray-100" : "bg-emerald-50 border-emerald-200"}`}
            >
              <p className={`text-sm ${n.readAt ? "text-gray-700" : "text-gray-900 font-semibold"}`}>{text(n)}</p>
              <p className="text-[11px] text-gray-500">{formatDate(n.createdAt, lang, { hour: "2-digit", minute: "2-digit" })}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
