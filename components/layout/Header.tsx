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
  /** Signed-in app pages: full-width app bar above the navigation rail, with the search field. */
  withSidebar?: boolean;
}

/** Top app bar: brand, search, notifications and the account avatar. */
export function Header({ activeBusinessName, userPhone, lang = "bn", isLoggedIn = false, isAdmin = false, withSidebar = false }: HeaderProps) {
  const t = useT();
  const router = useRouter();
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

  const iconBtn = "relative flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-200/70 hover:text-gray-900";

  return (
    <header className={`sticky top-0 z-40 bg-surface-canvas/95 backdrop-blur transition-shadow ${scrolled ? "shadow-card" : ""}`}>
      <div className="flex h-16 items-center gap-2 px-3 sm:px-4">
        <div className="flex shrink-0 items-center ps-1 lg:w-60">
          <Brand href={isLoggedIn ? "/home" : "/"} />
        </div>

        {withSidebar && (
          <form
            role="search"
            className="hidden max-w-[720px] flex-1 lg:block"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search");
            }}
          >
            <label className="group relative block">
              <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("home.searchPlaceholder")}
                aria-label={t("nav.search")}
                className="h-12 w-full rounded-full bg-gray-200/60 ps-14 pe-5 text-[15px] text-gray-900 outline-none transition placeholder:text-gray-600 focus:bg-white focus:shadow-raised"
              />
            </label>
          </form>
        )}

        <div className="ms-auto flex items-center gap-0.5 sm:gap-1">
          {withSidebar && (
            <Link href="/search" aria-label={t("nav.search")} className={`${iconBtn} lg:hidden`}>
              <Search className="h-5 w-5" />
            </Link>
          )}
          {isLoggedIn && (
            <Link href="/notifications" id="header-notifications" aria-label={t("notifications.open")} className={iconBtn}>
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span
                  id="header-unread"
                  className="absolute end-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-semibold text-white ring-2 ring-surface-canvas"
                >
                  {unread > 99 ? `${formatNumber(99, lang)}+` : formatNumber(unread, lang)}
                </span>
              )}
            </Link>
          )}
          {isLoggedIn || activeBusinessName || withSidebar ? (
            <AccountMenu activeBusinessName={activeBusinessName} userPhone={userPhone} lang={lang} isAdmin={isAdmin} />
          ) : (
            <Link href="/login" className="btn btn-primary">
              {t("auth.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
