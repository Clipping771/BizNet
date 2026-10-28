"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pencil } from "lucide-react";
import { useT } from "@/components/ui/T";
import { Avatar } from "./AccountMenu";
import { PRIMARY_NAV, TRADE_NAV, BUSINESS_NAV, ADMIN_NAV, isActivePath, type NavItem } from "./nav";

interface SidebarProps {
  activeBusinessName?: string;
  userPhone?: string;
  isAdmin: boolean;
}

/** Desktop navigation rail (lg and up), below the full-width app bar. */
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
        className={`flex h-10 items-center gap-4 rounded-full px-4 text-sm transition-colors ${
          active ? "bg-primary-100 font-semibold text-primary-900" : "text-gray-700 hover:bg-gray-200/60"
        }`}
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
        <span className="truncate">{t(labelKey)}</span>
      </Link>
    );
  };

  const section = (titleKey: string, items: NavItem[]) => (
    <div>
      <p className="px-4 pb-1 pt-5 text-xs font-medium text-gray-500">{t(titleKey)}</p>
      {items.map(link)}
    </div>
  );

  return (
    <aside className="fixed bottom-0 start-0 top-16 z-30 hidden w-64 flex-col bg-surface-canvas lg:flex">
      <div className="px-3 pb-3 pt-2">
        <Link
          href="/requests/new"
          className="inline-flex h-14 items-center gap-3 rounded-2xl bg-primary-100 pe-6 ps-4 text-sm font-medium text-primary-900 transition-shadow hover:shadow-raised"
        >
          <Pencil className="h-5 w-5" />
          {t("home.newRequest")}
        </Link>
      </div>

      <nav aria-label={t("nav.main")} className="flex-1 overflow-y-auto pb-4 pe-3 ps-2 scrollbar-none">
        {PRIMARY_NAV.map(link)}
        {section("nav.section.trade", TRADE_NAV)}
        {activeBusinessName && section("nav.section.business", BUSINESS_NAV)}
        {isAdmin && section("nav.section.admin", [ADMIN_NAV])}
      </nav>

      <Link href="/account" className="m-3 flex items-center gap-3 rounded-2xl bg-white p-3 transition-shadow hover:shadow-raised">
        <Avatar name={activeBusinessName || userPhone || "B"} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-gray-900">{activeBusinessName || t("nav.account")}</span>
          {userPhone && <span className="block truncate text-xs text-gray-500">{userPhone}</span>}
        </span>
      </Link>
    </aside>
  );
}
