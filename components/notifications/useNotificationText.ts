"use client";

import { useCallback } from "react";
import { Bell, FileText, ChatCircleDots, Package, Receipt, type Icon } from "@phosphor-icons/react";
import { useT } from "@/components/ui/T";

export interface NotificationItem {
  id: string;
  type: string;
  params?: Record<string, string> | null;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export function notificationIcon(type: string): Icon {
  if (type.startsWith("QUOTE")) return Receipt;
  if (type.startsWith("ORDER")) return Package;
  if (type.startsWith("MESSAGE")) return ChatCircleDots;
  if (type.startsWith("REQUEST")) return FileText;
  return Bell;
}

/** Tile colours per kind, so quotes, orders, messages and requests are told apart at a glance. */
export function notificationTone(type: string): string {
  if (type.startsWith("QUOTE")) return "bg-primary-50 text-primary-700";
  if (type.startsWith("ORDER")) return "bg-emerald-50 text-emerald-700";
  if (type.startsWith("MESSAGE")) return "bg-slate-100 text-slate-700";
  if (type.startsWith("REQUEST")) return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

/** Catalog text for a notification (notif.<TYPE> with its code/status), or the generic line. */
export function useNotificationText() {
  const t = useT();
  return useCallback(
    (n: NotificationItem) => {
      const p = n.params || {};
      const code = p.requestCode || p.orderCode || "";
      const status = p.status ? t(`order.status.${p.status}`) : "";
      const key = `notif.${n.type}`;
      const message = t(key, undefined, { code, status });
      return message === key ? t("notif.generic") : message;
    },
    [t]
  );
}

/** "3 hours ago" in the viewer's language (Bangla digits come from Intl for bn). */
export function timeAgo(iso: string, lang: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === "bn" ? "bn-BD" : lang, { numeric: "auto" });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  return rtf.format(seconds, "second");
}
