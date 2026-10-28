"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useT } from "@/components/ui/T";
import { Brand } from "./Brand";
import { initials } from "./AccountMenu";
import { PRIMARY_NAV, TRADE_NAV, BUSINESS_NAV, ADMIN_NAV, isActivePath, type NavItem } from "./nav";

interface SidebarProps {
  activeBusinessName?: string;
  userPhone?: string;
  isAdmin: boolean;
}

/** Desktop navigation rail (lg and up). */
export function Sidebar({ activeBusinessName, userPhone, isAdmin }: SidebarProps) {
  const pathname = usePathname();
  const t = useT();

  const link = ({ href, labelKey, icon: Icon }: NavItem) => {
    const active = isActivePath(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          active ? "bg-primary-50 text-primary-800" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }`}
      >
        <Icon className={`h-[18px] w-[18px] ${active ? "text-primary-700" : "text-gray-400 group-hover:text-gray-600"}`} strokeWidth={active ? 2.3 : 2} />
        {t(labelKey)}
      </Link>
    );
  };

  const section = (titleKey: string, items: NavItem[]) => (
    <div className="space-y-0.5">
      <p className="px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t(titleKey)}</p>
      {items.map(link)}
    </div>
  );

  return (
    <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col border-e border-gray-200/80 bg-white lg:flex">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>

      <div className="px-4 pb-2">
        <Link href="/requests/new" className="btn btn-primary w-full">
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          {t("home.newRequest")}
        </Link>
      </div>

      <nav aria-label={t("nav.main")} className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-none">
        <div className="space-y-0.5 pt-2">{PRIMARY_NAV.map(link)}</div>
        {section("nav.section.trade", TRADE_NAV)}
        {activeBusinessName && section("nav.section.business", BUSINESS_NAV)}
        {isAdmin && section("nav.section.admin", [ADMIN_NAV])}
      </nav>

      <div className="border-t border-gray-100 p-3">
        <Link href="/account" className="flex items-center gap-3 rounded-xl p-2 hover:bg-gray-50">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-800">
            {initials(activeBusinessName || userPhone || "B")}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-gray-900">{activeBusinessName || t("nav.account")}</span>
            {userPhone && <span className="block truncate text-xs text-gray-500">{userPhone}</span>}
          </span>
        </Link>
      </div>
    </aside>
  );
}
