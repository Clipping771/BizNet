"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Package, ChatCircleDots, BellRinging } from "@phosphor-icons/react";
import { T, useLang, useT } from "@/components/ui/T";
import { formatNumber } from "@/lib/money";

interface Summary {
  openRequests: number;
  activeOrders: number;
  unreadMessages: number;
  unreadNotifications: number;
}

/** Rail card: the four counts that need attention (open requests, active orders, unread messages, alerts). */
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

  const rows = [
    { href: "/requests", key: "home.stat.openRequests", value: summary?.openRequests, id: "home-open-requests", icon: FileText, tone: "bg-teal-50 text-teal-700" },
    { href: "/orders", key: "home.stat.activeOrders", value: summary?.activeOrders, id: "home-active-orders", icon: Package, tone: "bg-emerald-50 text-emerald-700" },
    { href: "/inbox", key: "home.stat.unreadMessages", value: summary?.unreadMessages, id: "home-unread-messages", icon: ChatCircleDots, tone: "bg-slate-100 text-slate-700" },
    { href: "/notifications", key: "home.stat.notifications", value: summary?.unreadNotifications, id: "home-notifications", icon: BellRinging, tone: "bg-amber-50 text-amber-700" },
  ];

  return (
    <section id="home-activity" aria-label={t("home.greeting")} className="rounded-2xl border border-slate-200 bg-white p-2">
      <h2 className="px-3 pb-1 pt-2 text-[15px] font-semibold text-slate-900">
        <T k="home.rail.activity" />
      </h2>
      {rows.map(({ href, key, value, id, icon: Icon, tone }) => (
        <Link key={href} href={href} id={id} className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-slate-50">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
            <Icon size={18} weight="duotone" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{t(key)}</span>
          {summary ? (
            <span className="text-[15px] font-semibold tabular-nums text-slate-900">{formatNumber(value ?? 0, lang)}</span>
          ) : (
            <span className="h-5 w-6 animate-pulse rounded bg-slate-100" />
          )}
        </Link>
      ))}
    </section>
  );
}
