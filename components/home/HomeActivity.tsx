"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Package, MessageSquare, Bell, Plus } from "lucide-react";
import { T, useLang, useT } from "@/components/ui/T";
import { StatusChip, REQUEST_STATUS_TONE } from "@/components/ui/ListStates";
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

  const tiles = [
    { href: "/requests", icon: FileText, key: "home.stat.openRequests", value: summary?.openRequests, id: "home-open-requests", tone: "bg-[#E8F0FE] text-[#1967D2]" },
    { href: "/orders", icon: Package, key: "home.stat.activeOrders", value: summary?.activeOrders, id: "home-active-orders", tone: "bg-[#E6F4EA] text-[#137333]" },
    { href: "/inbox", icon: MessageSquare, key: "home.stat.unreadMessages", value: summary?.unreadMessages, id: "home-unread-messages", tone: "bg-[#F3E8FD] text-[#8430CE]" },
    { href: "/notifications", icon: Bell, key: "home.stat.notifications", value: summary?.unreadNotifications, id: "home-notifications", tone: "bg-[#FEF7E0] text-[#B06000]" },
  ];

  return (
    <section id="home-activity" aria-label={t("home.greeting")} className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ href, icon: Icon, key, value, id, tone }) => (
          <Link key={href} href={href} id={id} className="card card-link flex items-center gap-3 p-3.5 sm:flex-col sm:items-start sm:p-4">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              {summary ? (
                <p className="text-xl font-semibold tabular-nums leading-tight text-gray-900 sm:text-[26px]">{formatNumber(value ?? 0, lang)}</p>
              ) : (
                <span className="block h-7 w-8 animate-pulse rounded-md bg-gray-100" />
              )}
              <p className="truncate text-xs font-medium text-gray-500">{t(key)}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 className="section-title">
            <T k="home.recentRequests" />
          </h2>
          <Link href="/requests" className="text-xs font-semibold text-primary-700 hover:underline">
            <T k="common.viewAll" />
          </Link>
        </div>
        {!summary ? (
          <div className="space-y-2 px-5 pb-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-50" />
            ))}
          </div>
        ) : summary.recentRequests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 pb-6 pt-2 text-center">
            <p className="text-sm text-gray-500">
              <T k="home.recentEmpty" />
            </p>
            <Link href="/requests/new" className="btn btn-soft btn-sm">
              <Plus className="h-3.5 w-3.5" />
              <T k="home.newRequest" />
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 border-t border-gray-100">
            {summary.recentRequests.map((r) => (
              <li key={r.code}>
                <Link href={`/requests/${r.code}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-gray-50">
                  <span className="icon-tile h-9 w-9">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{r.title}</span>
                    <span className="block text-xs text-gray-500">
                      {t("home.quoteCount", undefined, { n: formatNumber(r._count.quotes, lang) })}
                    </span>
                  </span>
                  <StatusChip k={`reqStatus.${r.status}`} tone={REQUEST_STATUS_TONE[r.status] ?? "gray"} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
