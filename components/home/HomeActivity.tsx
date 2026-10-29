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
    { href: "/requests", icon: FileText, key: "home.stat.openRequests", value: summary?.openRequests, id: "home-open-requests", tone: "bg-blue-50 text-blue-700 ring-1 ring-blue-700/10" },
    { href: "/orders", icon: Package, key: "home.stat.activeOrders", value: summary?.activeOrders, id: "home-active-orders", tone: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-700/10" },
    { href: "/inbox", icon: MessageSquare, key: "home.stat.unreadMessages", value: summary?.unreadMessages, id: "home-unread-messages", tone: "bg-purple-50 text-purple-700 ring-1 ring-purple-700/10" },
    { href: "/notifications", icon: Bell, key: "home.stat.notifications", value: summary?.unreadNotifications, id: "home-notifications", tone: "bg-amber-50 text-amber-700 ring-1 ring-amber-700/10" },
  ];

  return (
    <section id="home-activity" aria-label={t("home.greeting")} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ href, icon: Icon, key, value, id, tone }) => (
          <Link key={href} href={href} id={id} className="card card-link flex items-center gap-3 p-3.5 border border-slate-200/80 bg-white shadow-sm transition hover:shadow-md sm:flex-col sm:items-start sm:p-4">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              {summary ? (
                <p className="text-xl font-bold tabular-nums leading-tight text-slate-900 sm:text-2xl">{formatNumber(value ?? 0, lang)}</p>
              ) : (
                <span className="block h-7 w-8 animate-pulse rounded-md bg-slate-100" />
              )}
              <p className="truncate text-xs font-medium text-slate-500 mt-0.5">{t(key)}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="card overflow-hidden border border-slate-200/80 bg-white shadow-sm transition hover:shadow-md">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-50 text-primary">
              <FileText className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-bold text-slate-900">
              <T k="home.recentRequests" />
            </h2>
          </div>
          <Link href="/requests" className="text-xs font-semibold text-primary hover:underline">
            <T k="common.viewAll" />
          </Link>
        </div>
        {!summary ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-50" />
            ))}
          </div>
        ) : summary.recentRequests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                <T k="home.recentEmpty" />
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Start by posting your first RFQ to receive competitive quotes</p>
            </div>
            <Link href="/requests/new" className="btn btn-primary btn-sm mt-1">
              <Plus className="h-4 w-4" />
              <T k="home.newRequest" />
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {summary.recentRequests.map((r) => (
              <li key={r.code}>
                <Link href={`/requests/${r.code}`} className="group flex items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-slate-50/80">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-primary-50 group-hover:text-primary transition-colors">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-primary transition-colors">{r.title}</span>
                      <span className="block text-xs font-medium text-slate-500">
                        {t("home.quoteCount", undefined, { n: formatNumber(r._count.quotes, lang) })} &bull; <span className="font-mono text-slate-400">{r.code}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <StatusChip k={`reqStatus.${r.status}`} tone={REQUEST_STATUS_TONE[r.status] ?? "gray"} />
                    <span className="hidden sm:inline-flex text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      View &rarr;
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
