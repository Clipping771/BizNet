"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Package, MessageSquare, Bell } from "lucide-react";
import { T, useLang, useT } from "@/components/ui/T";
import { formatNumber } from "@/lib/money";

interface Summary {
  openRequests: number;
  activeOrders: number;
  unreadMessages: number;
  unreadNotifications: number;
  recentRequests: Array<{ code: string; title: string; status: string; _count: { quotes: number } }>;
}

/** What needs the user's attention: open requests, active orders, unread messages and notifications. */
export function HomeActivity() {
  const t = useT();
  const lang = useLang();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    fetch("/api/home")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  if (!summary) return null;

  const tiles = [
    { href: "/requests", icon: FileText, label: t("home.openRequests", undefined, { n: formatNumber(summary.openRequests, lang) }), id: "home-open-requests" },
    { href: "/orders", icon: Package, label: t("home.activeOrders", undefined, { n: formatNumber(summary.activeOrders, lang) }), id: "home-active-orders" },
    { href: "/inbox", icon: MessageSquare, label: t("home.unreadMessages", undefined, { n: formatNumber(summary.unreadMessages, lang) }), id: "home-unread-messages" },
    { href: "/notifications", icon: Bell, label: t("home.unreadNotifications", undefined, { n: formatNumber(summary.unreadNotifications, lang) }), id: "home-notifications" },
  ];

  return (
    <section id="home-activity" className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3">
      <h3 className="font-bold text-sm text-gray-900">
        <T k="home.greeting" />
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(({ href, icon: Icon, label, id }) => (
          <Link key={href} href={href} id={id} className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-800">
            <Icon className="w-4 h-4 text-primary shrink-0" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
      {summary.recentRequests.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-gray-500">
            <T k="home.recentRequests" />
          </p>
          {summary.recentRequests.map((r) => (
            <Link key={r.code} href={`/requests/${r.code}`} className="flex items-center justify-between gap-2 text-xs py-1">
              <span className="truncate text-gray-800">{r.title}</span>
              <span className="shrink-0 text-gray-500">{t(`reqStatus.${r.status}`)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
