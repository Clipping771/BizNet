"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ReceiptText, Package, MessageSquare, FileText } from "lucide-react";
import { T, useLang, useT } from "@/components/ui/T";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/ui/ListStates";
import { formatDate } from "@/lib/dates";

function iconFor(type: string) {
  if (type.startsWith("QUOTE")) return ReceiptText;
  if (type.startsWith("ORDER")) return Package;
  if (type.startsWith("MESSAGE")) return MessageSquare;
  if (type.startsWith("REQUEST")) return FileText;
  return Bell;
}

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
    <div className="page space-y-5">
      <PageHeader titleKey="notifications.title">
        {items && items.some((n) => !n.readAt) && (
          <button
            type="button"
            id="notifications-mark-all"
            onClick={async () => {
              await markRead();
              await load();
            }}
            className="btn btn-ghost btn-sm text-primary-700"
          >
            <CheckCheck className="h-4 w-4" />
            <T k="notifications.markAll" />
          </button>
        )}
      </PageHeader>
      {items === null ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState k="notifications.empty" icon={Bell} />
      ) : (
        <div id="notification-list" className="card divide-y divide-gray-100 overflow-hidden">
          {items.map((n) => {
            const Icon = iconFor(n.type);
            return (
              <Link
                key={n.id}
                href={n.link || "/home"}
                data-notification={n.type}
                data-read={n.readAt ? "true" : "false"}
                onClick={() => {
                  if (!n.readAt) markRead([n.id]);
                }}
                className={`relative flex items-start gap-3.5 px-4 py-3.5 transition hover:bg-gray-50 ${n.readAt ? "" : "bg-primary-50/50"}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${n.readAt ? "bg-gray-100 text-gray-500" : "bg-primary-100 text-primary-700"}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.readAt ? "text-gray-600" : "font-semibold text-gray-900"}`}>{text(n)}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{formatDate(n.createdAt, lang, { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" aria-hidden="true" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
