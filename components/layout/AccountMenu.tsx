"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, UserRound, LayoutDashboard } from "lucide-react";
import { useT } from "@/components/ui/T";
import { BUSINESS_NAV } from "./nav";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts.slice(0, 1);
  return letters.map((p) => Array.from(p)[0] ?? "").join("").toUpperCase() || "B";
}

interface AccountMenuProps {
  activeBusinessName?: string;
  userPhone?: string;
  lang: string;
  isAdmin: boolean;
}

/** Avatar button with the account / business dropdown. */
export function AccountMenu({ activeBusinessName, userPhone, lang, isAdmin }: AccountMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Logged-in users without a business (e.g. admins, new sign-ups) still get the account menu
  const label = activeBusinessName || userPhone || t("nav.account");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-50";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        id="account-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 ps-1 pe-2.5 text-sm font-medium text-gray-800 shadow-card transition hover:border-gray-300"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-800">
          {initials(label)}
        </span>
        <span className="max-w-[110px] truncate text-xs sm:max-w-[160px]">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 z-50 mt-2 w-64 origin-top-right animate-fade-up rounded-2xl border border-gray-200/80 bg-white p-1.5 shadow-pop"
        >
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-800">
              {initials(label)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{label}</p>
              {userPhone && <p className="truncate text-xs text-gray-500">{userPhone}</p>}
            </div>
          </div>
          <div className="divider my-1" />
          <Link href="/account" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <UserRound className="h-4 w-4 text-gray-400" />
            {t("nav.account")}
          </Link>
          {isAdmin && (
            <Link href="/admin" role="menuitem" className={item} onClick={() => setOpen(false)}>
              <LayoutDashboard className="h-4 w-4 text-gray-400" />
              {t("admin.nav.dashboard")}
            </Link>
          )}
          {BUSINESS_NAV.filter((n) => activeBusinessName || n.href === "/account/language").map(({ href, labelKey, icon: Icon }) => (
            <Link key={href} href={href} role="menuitem" className={item} onClick={() => setOpen(false)}>
              <Icon className="h-4 w-4 text-gray-400" />
              <span className="flex-1">{t(labelKey)}</span>
              {href === "/account/language" && <span className="text-[11px] font-semibold uppercase text-gray-400">{lang}</span>}
            </Link>
          ))}
          <div className="divider my-1" />
          <Link href="/api/auth/logout" role="menuitem" className={`${item} text-secondary hover:bg-secondary-light`} onClick={() => setOpen(false)}>
            <LogOut className="h-4 w-4" />
            {t("nav.logout")}
          </Link>
        </div>
      )}
    </div>
  );
}
