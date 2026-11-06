"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useT } from "@/components/ui/T";
import { formatNumber } from "@/lib/money";
import { Brand } from "./Brand";
import { AccountMenu } from "./AccountMenu";
import { TOP_NAV, isActivePath } from "./nav";

interface HeaderProps {
  activeBusinessName?: string;
  userPhone?: string;
  lang?: string;
  isLoggedIn?: boolean;
  isAdmin?: boolean;
  /** Signed-in app pages: navigation tabs and search. */
  withSidebar?: boolean;
}

/** Quiet top bar: brand, text tabs, search, alerts and the account menu. */
export function Header({ activeBusinessName, userPhone, lang = "en", isLoggedIn = false, isAdmin = false, withSidebar = false }: HeaderProps) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
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

  // "/" opens search from anywhere except while typing
  useEffect(() => {
    if (!withSidebar) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        router.push("/search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [withSidebar, router]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const iconBtn = "relative flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900";

  return (
    <header className={`sticky top-0 z-40 bg-white/80 backdrop-blur-xl transition-[border-color] ${scrolled ? "border-b border-slate-200" : "border-b border-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-8">
        <Brand href={isLoggedIn ? "/home" : "/"} />

        {withSidebar && (
          <nav aria-label={t("nav.main")} className="hidden items-center gap-1 md:flex">
            {TOP_NAV.map(({ href, labelKey, icon: Icon }) => {
              const active = isActivePath(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active ? "bg-teal-50 font-semibold text-teal-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon size={18} weight={active ? "fill" : "regular"} />
                  {t(labelKey)}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ms-auto flex items-center gap-1">
          {withSidebar && (
            <Link
              href="/search"
              aria-label={t("nav.search")}
              className="me-1 hidden h-9 w-56 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-500 lg:flex"
            >
              <MagnifyingGlass size={16} />
              <span className="flex-1">{t("nav.search")}</span>
              <kbd className="rounded border border-slate-200 px-1.5 font-sans text-[11px] text-slate-400">/</kbd>
            </Link>
          )}
          {withSidebar && (
            <Link href="/search" aria-label={t("nav.search")} className={`${iconBtn} lg:hidden`}>
              <MagnifyingGlass size={20} />
            </Link>
          )}
          {isLoggedIn && (
            <Link href="/notifications" id="header-notifications" aria-label={t("notifications.open")} className={iconBtn}>
              <Bell size={20} weight={isActivePath(pathname, "/notifications") ? "fill" : "regular"} />
              {unread > 0 && (
                <span
                  id="header-unread"
                  className="absolute end-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white"
                >
                  {unread > 99 ? `${formatNumber(99, lang)}+` : formatNumber(unread, lang)}
                </span>
              )}
            </Link>
          )}
          {isLoggedIn ? (
            <AccountMenu activeBusinessName={activeBusinessName} userPhone={userPhone} lang={lang} isAdmin={isAdmin} />
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="btn btn-ghost">
                {t("auth.login")}
              </Link>
              <Link href="/login" className="btn btn-primary">
                {t("landing.getStarted")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
