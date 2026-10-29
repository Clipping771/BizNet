"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Bell, Search, Home, FileText, ReceiptText, MessageSquare, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/components/ui/T";
import { formatNumber } from "@/lib/money";
import { Brand } from "./Brand";
import { AccountMenu } from "./AccountMenu";
import { isActivePath } from "./nav";

interface HeaderProps {
  activeBusinessName?: string;
  userPhone?: string;
  lang?: string;
  isLoggedIn?: boolean;
  isAdmin?: boolean;
  /** Signed-in app pages: full-width app bar above the navigation rail, with the search field. */
  withSidebar?: boolean;
}

/** Top app bar: brand, search, LinkedIn-style navigation tabs, notifications and account avatar. */
export function Header({ activeBusinessName, userPhone, lang = "bn", isLoggedIn = false, isAdmin = false, withSidebar = false }: HeaderProps) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [q, setQ] = useState("");
  const [scrolled, setScrolled] = useState(false);

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

  // The bar lifts off the page once content scrolls under it
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const topNavTabs = [
    { href: "/home", label: "Home", icon: Home },
    { href: "/requests", label: "RFQs", icon: FileText },
    { href: "/quotes", label: "Quotes", icon: ReceiptText },
    { href: "/prices", label: "Market", icon: TrendingUp },
    { href: "/inbox", label: "Messaging", icon: MessageSquare },
  ];

  const iconBtn = "relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900";

  return (
    <header className={`sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md transition-shadow ${scrolled ? "shadow-sm" : ""}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-3 sm:px-6">
        <div className="flex items-center gap-3 lg:gap-5">
          <Brand href={isLoggedIn ? "/home" : "/"} />

          {withSidebar && (
            <form
              role="search"
              className="relative hidden sm:block w-48 md:w-64 lg:w-72"
              onSubmit={(e) => {
                e.preventDefault();
                router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search");
              }}
            >
              <label className="group relative block">
                <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("home.searchPlaceholder")}
                  aria-label={t("nav.search")}
                  className="h-9 w-full rounded-full border border-slate-200 bg-slate-100/70 ps-9 pe-4 text-xs text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary"
                />
              </label>
            </form>
          )}
        </div>

        {/* Center LinkedIn-style desktop navigation tabs */}
        {isLoggedIn && (
          <nav aria-label="Global Navigation" className="hidden md:flex items-center gap-1 lg:gap-2">
            {topNavTabs.map((tab) => {
              const Icon = tab.icon;
              const active = isActivePath(pathname, tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`group relative flex h-14 min-w-[56px] flex-col items-center justify-center px-2 text-[11px] font-medium transition-colors ${
                    active ? "text-primary font-bold" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.3 : 1.8} />
                  <span className="truncate">{tab.label}</span>
                  {active && (
                    <span className="absolute bottom-0 h-0.5 w-full max-w-[40px] rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Right side controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {withSidebar && (
            <Link href="/search" aria-label={t("nav.search")} className={`${iconBtn} sm:hidden`}>
              <Search className="h-5 w-5" />
            </Link>
          )}

          {isLoggedIn && (
            <Link href="/notifications" id="header-notifications" aria-label={t("notifications.open")} className={iconBtn}>
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span
                  id="header-unread"
                  className="absolute end-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-white"
                >
                  {unread > 99 ? `${formatNumber(99, lang)}+` : formatNumber(unread, lang)}
                </span>
              )}
            </Link>
          )}

          {isLoggedIn || activeBusinessName || withSidebar ? (
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
