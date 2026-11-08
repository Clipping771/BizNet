"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CaretDown, Check, SquaresFour, SignOut, Translate } from "@phosphor-icons/react";
import { useT } from "@/components/ui/T";
import { BUSINESS_NAV, TRADE_NAV } from "./nav";

export function initials(name: string): string {
  // First letter of the first and last word; phone numbers and symbols fall back to "B"
  const words = name.trim().split(/\s+/).map((w) => w.match(/\p{L}/u)?.[0]).filter(Boolean) as string[];
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.join("").toUpperCase() || "B";
}

// Soft tinted monograms, picked by name so a business always gets the same colour
const AVATAR_TONES = [
  "bg-primary-50 text-primary-700 ring-primary-100",
  "bg-violet-50 text-violet-700 ring-violet-100",
  "bg-emerald-50 text-emerald-700 ring-emerald-100",
  "bg-amber-50 text-amber-800 ring-amber-100",
  "bg-sky-50 text-sky-700 ring-sky-100",
  "bg-rose-50 text-rose-700 ring-rose-100",
];

/** Rounded-square monogram for a business, like a company logo placeholder. */
export function Avatar({ name, size = "h-9 w-9 text-sm" }: { name: string; size?: string }) {
  const hash = Array.from(name).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-[10px] font-semibold tracking-tight ring-1 ring-inset ${AVATAR_TONES[hash % AVATAR_TONES.length]} ${size}`}>
      {initials(name)}
    </span>
  );
}

interface AccountMenuProps {
  activeBusinessName?: string;
  activeBusinessId?: string;
  businesses?: { id: string; name: string }[];
  userPhone?: string;
  lang: string;
  isAdmin: boolean;
}

/** Account dropdown: business switcher, language, account and logout (§7). */
export function AccountMenu({ activeBusinessName, activeBusinessId, businesses = [], userPhone, lang, isAdmin }: AccountMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const switchBusiness = async (businessId: string) => {
    setSwitching(true);
    const res = await fetch("/api/business/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId }),
    }).catch(() => null);
    if (res?.ok) {
      window.location.assign("/home");
      return;
    }
    setSwitching(false);
  };
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

  const item = "flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        id="account-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className="ms-1 flex h-10 items-center gap-1.5 rounded-full p-1 pe-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <span aria-hidden="true">
          <Avatar name={label} size="h-8 w-8 text-xs" />
        </span>
        <span className="hidden max-w-[150px] truncate ps-1 text-sm font-medium text-slate-700 lg:block">{label}</span>
        <span className="sr-only lg:hidden">{label}</span>
        <CaretDown aria-hidden="true" size={14} className={`hidden transition-transform sm:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="absolute end-0 z-50 mt-2 w-72 animate-fade-up overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-pop">
          <div className="px-4 pb-3">
            <div className="flex items-center gap-3">
              <Avatar name={label} size="h-14 w-14 text-lg" />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-slate-900">{label}</p>
                {userPhone && <p className="truncate text-sm text-slate-500">{userPhone}</p>}
              </div>
            </div>
            <Link href="/account" role="menuitem" onClick={() => setOpen(false)} className="btn btn-secondary btn-sm mt-3 w-full">
              {t("nav.account")}
            </Link>
          </div>

          {businesses.length > 1 && (
            <div className="border-t border-slate-200 py-1">
              <p className="eyebrow px-4 pb-1 pt-2">{t("nav.switchBusiness")}</p>
              {businesses.map((b) => {
                const current = b.id === activeBusinessId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="menuitem"
                    disabled={current || switching}
                    onClick={() => switchBusiness(b.id)}
                    className={`${item} w-full text-start disabled:cursor-default`}
                  >
                    <Avatar name={b.name} size="h-6 w-6 text-[10px]" />
                    <span className="flex-1 truncate">{b.name}</span>
                    {current && <Check size={16} weight="bold" className="text-primary-700" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* The sidebar carries these from md up; phones reach them here */}
          <div className="border-t border-slate-200 py-1 md:hidden">
            {TRADE_NAV.filter((n) => n.href !== "/notifications").map(({ href, labelKey, icon: Icon }) => (
              <Link key={href} href={href} role="menuitem" className={item} onClick={() => setOpen(false)}>
                <Icon size={18} className="text-slate-500" />
                {t(labelKey)}
              </Link>
            ))}
          </div>

          {activeBusinessName && (
            <div className="border-t border-slate-200 py-1 md:hidden">
              <p className="px-4 pb-1 pt-2 text-sm font-semibold text-slate-900">{t("nav.section.business")}</p>
              {BUSINESS_NAV.filter((n) => n.href !== "/account/language").map(({ href, labelKey, icon: Icon }) => (
                <Link key={href} href={href} role="menuitem" className={item} onClick={() => setOpen(false)}>
                  <Icon size={18} className="text-slate-500" />
                {t(labelKey)}
                </Link>
              ))}
            </div>
          )}

          <div className="border-t border-slate-200 py-1">
            <Link href="/account/language" role="menuitem" className={item} onClick={() => setOpen(false)}>
              <Translate size={18} className="text-slate-500" />
              <span className="flex-1">{t("common.language")}</span>
              <span className="text-xs font-semibold uppercase text-slate-500">{lang}</span>
            </Link>
            {isAdmin && (
              <Link href="/admin" role="menuitem" className={item} onClick={() => setOpen(false)}>
                <SquaresFour size={18} className="text-slate-500" />
                {t("admin.nav.dashboard")}
              </Link>
            )}
          </div>

          <div className="border-t border-slate-200 pt-1">
            <Link href="/api/auth/logout" role="menuitem" className={item} onClick={() => setOpen(false)}>
              <SignOut size={18} className="text-slate-500" />
              {t("nav.logout")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
