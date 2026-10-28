"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/components/ui/T";
import { formatNumber } from "@/lib/money";
import { Brand } from "./Brand";
import { AccountMenu } from "./AccountMenu";

interface HeaderProps {
  activeBusinessName?: string;
  userPhone?: string;
  lang?: string;
  isLoggedIn?: boolean;
  isAdmin?: boolean;
  /** The sidebar carries the brand on desktop, so the header hides it from lg up. */
  withSidebar?: boolean;
}

export function Header({ activeBusinessName, userPhone, lang = "bn", isLoggedIn = false, isAdmin = false, withSidebar = false }: HeaderProps) {
  const t = useT();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [q, setQ] = useState("");

  // Unread notification badge, refreshed every minute while the app is open
  useEffect(() => {
    if (!isLoggedIn) return;
    const load = () =>
      fetch("/api/notifications?count=1")
        .then((r) => (r.ok ? r.json() : { unread: 0 }))
        .then((d) => setUnread(d.unread || 0))
        .catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [isLoggedIn]);

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/90 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
        <div className={withSidebar ? "lg:hidden" : undefined}>
          <Brand href={isLoggedIn ? "/home" : "/"} />
        </div>

        {withSidebar && (
          <form
            role="search"
            className="hidden max-w-md flex-1 lg:block"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search");
            }}
          >
            <label className="relative block">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("home.searchPlaceholder")}
                aria-label={t("nav.search")}
                className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 ps-10 pe-3 text-sm placeholder:text-gray-400 hover:border-gray-300 focus:bg-white"
              />
            </label>
          </form>
        )}

        <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
          {isLoggedIn && (
            <Link
              href="/notifications"
              id="header-notifications"
              aria-label={t("notifications.open")}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span
                  id="header-unread"
                  className="absolute end-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold text-white ring-2 ring-white"
                >
                  {unread > 99 ? `${formatNumber(99, lang)}+` : formatNumber(unread, lang)}
                </span>
              )}
            </Link>
          )}
          {isLoggedIn || activeBusinessName ? (
            <AccountMenu activeBusinessName={activeBusinessName} userPhone={userPhone} lang={lang} isAdmin={isAdmin} />
          ) : (
            <Link href="/login" className="btn btn-primary btn-sm">
              {t("auth.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
