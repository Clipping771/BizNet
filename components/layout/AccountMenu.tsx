"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, LayoutDashboard, X } from "lucide-react";
import { useT } from "@/components/ui/T";
import { BUSINESS_NAV } from "./nav";

export function initials(name: string): string {
  // First letter of the first and last word; phone numbers and symbols fall back to "B"
  const words = name.trim().split(/\s+/).map((w) => w.match(/\p{L}/u)?.[0]).filter(Boolean) as string[];
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.join("").toUpperCase() || "B";
}

/** Circle with initials on a colour picked from the name, so each business keeps its own colour. */
export function Avatar({ name, size = "h-9 w-9 text-sm" }: { name: string; size?: string }) {
  const palette = ["bg-[#1A73E8]", "bg-[#006A4E]", "bg-[#A142F4]", "bg-[#E8710A]", "bg-[#D93025]", "bg-[#12B5CB]", "bg-[#5F6368]"];
  const hash = Array.from(name).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-medium text-white ${palette[hash % palette.length]} ${size}`}>
      {initials(name)}
    </span>
  );
}

interface AccountMenuProps {
  activeBusinessName?: string;
  userPhone?: string;
  lang: string;
  isAdmin: boolean;
}

/** Avatar button with the account / business popup. */
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

  const item = "flex items-center gap-4 px-6 py-3 text-sm text-gray-800 transition-colors hover:bg-gray-200/60";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        id="account-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className="ms-1 flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-gray-200/70"
      >
        <span aria-hidden="true">
          <Avatar name={label} size="h-8 w-8 text-[13px]" />
        </span>
        <span className="sr-only">{label}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 z-50 mt-2 w-[min(360px,calc(100vw-24px))] origin-top-right animate-fade-up overflow-hidden rounded-[28px] bg-[#E9EEF6] p-2 shadow-pop"
        >
          <div className="relative flex flex-col items-center px-4 pb-4 pt-3 text-center">
            <button
              type="button"
              aria-label={t("common.close")}
              onClick={() => setOpen(false)}
              className="absolute end-1 top-1 flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-300/40"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
            {userPhone && <p className="text-sm text-gray-700">{userPhone}</p>}
            <div className="mt-4">
              <Avatar name={label} size="h-20 w-20 text-3xl" />
            </div>
            <p className="mt-3 text-[22px] font-normal text-gray-900">{label}</p>
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="mt-4 inline-flex h-10 items-center rounded-full border border-gray-500/60 px-6 text-sm font-medium text-primary-800 hover:bg-primary-50"
            >
              {t("nav.account")}
            </Link>
          </div>
          <div className="overflow-hidden rounded-3xl bg-white py-2">
            {isAdmin && (
              <Link href="/admin" role="menuitem" className={item} onClick={() => setOpen(false)}>
                <LayoutDashboard className="h-5 w-5 text-gray-600" />
                {t("admin.nav.dashboard")}
              </Link>
            )}
            {BUSINESS_NAV.filter((n) => activeBusinessName || n.href === "/account/language").map(({ href, labelKey, icon: Icon }) => (
              <Link key={href} href={href} role="menuitem" className={item} onClick={() => setOpen(false)}>
                <Icon className="h-5 w-5 text-gray-600" />
                <span className="flex-1">{t(labelKey)}</span>
                {href === "/account/language" && <span className="text-xs font-medium uppercase text-gray-500">{lang}</span>}
              </Link>
            ))}
            <div className="my-1 border-t border-gray-200" />
            <Link href="/api/auth/logout" role="menuitem" className={item} onClick={() => setOpen(false)}>
              <LogOut className="h-5 w-5 text-gray-600" />
              {t("nav.logout")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
