"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChatCircleDots, MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useT } from "@/components/ui/T";
import { formatNumber } from "@/lib/money";
import { Brand } from "./Brand";
import { AccountMenu } from "./AccountMenu";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { isActivePath } from "./nav";

interface HeaderProps {
  activeBusinessName?: string;
  activeBusinessId?: string;
  businesses?: { id: string; name: string }[];
  userPhone?: string;
  lang?: string;
  isLoggedIn?: boolean;
  isAdmin?: boolean;
  /** Signed-in app pages: the sidebar carries navigation, so the brand shows on phones only. */
  withSidebar?: boolean;
}

/** Utility bar: search, new request, alerts and the account menu. */
export function Header({ activeBusinessName, activeBusinessId, businesses = [], userPhone, lang = "en", isLoggedIn = false, isAdmin = false, withSidebar = false }: HeaderProps) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

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

  const iconBtn = "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl backdrop-saturate-150">
      <div className={`flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8 ${withSidebar ? "" : "mx-auto max-w-7xl"}`}>
        <div className={withSidebar ? "md:hidden" : ""}>
          <Brand href={isLoggedIn ? "/home" : "/"} />
        </div>

        {withSidebar && (
          <Link
            href="/search"
            aria-label={t("nav.search")}
            className="hidden h-10 w-full max-w-md items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 text-sm text-slate-400 transition-all hover:border-slate-300 hover:bg-white hover:shadow-card md:flex"
          >
            <MagnifyingGlass size={16} />
            <span className="flex-1 truncate">{t("nav.search")}</span>
            <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500 shadow-sm">/</kbd>
          </Link>
        )}

        <div className="ms-auto flex items-center gap-1">
          {withSidebar && (
            <Link href="/search" aria-label={t("nav.search")} className={`${iconBtn} md:hidden`}>
              <MagnifyingGlass size={20} />
            </Link>
          )}
          {isLoggedIn && (
            <Link href="/inbox" aria-label={t("nav.inbox")} className={iconBtn}>
              <ChatCircleDots size={20} weight={isActivePath(pathname, "/inbox") ? "fill" : "regular"} />
            </Link>
          )}
          {isLoggedIn && (
            <Link href="/notifications" id="header-notifications" aria-label={t("notifications.open")} className={iconBtn}>
              <Bell size={20} weight={isActivePath(pathname, "/notifications") ? "fill" : "regular"} />
              {unread > 0 && (
                <span
                  id="header-unread"
                  className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white"
                >
                  {unread > 99 ? `${formatNumber(99, lang)}+` : formatNumber(unread, lang)}
                </span>
              )}
            </Link>
          )}
          {isLoggedIn ? (
            <AccountMenu
              activeBusinessName={activeBusinessName}
              activeBusinessId={activeBusinessId}
              businesses={businesses}
              userPhone={userPhone}
              lang={lang}
              isAdmin={isAdmin}
            />
          ) : (
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">
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
