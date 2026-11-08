"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { useT } from "@/components/ui/T";
import { Brand } from "./Brand";
import { Avatar } from "./AccountMenu";
import { navSections, type NavItem } from "./nav";

interface SidebarProps {
  isSupplier: boolean;
  isAdmin: boolean;
  hasBusiness: boolean;
  creditsEnabled: boolean;
  activeBusinessName?: string;
}

/** The longest matching href wins, so /requests/inbox lights up its own row and not /requests. */
export function activeHref(pathname: string, items: NavItem[]): string | undefined {
  return items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/**
 * Light navigation column, grouped by job, with the main action on top and the active business at
 * the bottom. An icon rail on tablets so the page keeps its width; full labels from lg up.
 * Phones use the tab bar instead.
 */
export function Sidebar({ isSupplier, isAdmin, hasBusiness, creditsEnabled, activeBusinessName }: SidebarProps) {
  const t = useT();
  const pathname = usePathname();
  const sections = navSections({ isSupplier, isAdmin, hasBusiness, creditsEnabled });
  const current = activeHref(pathname, sections.flatMap((s) => s.items));
  const newLabel = t("home.newRequest");

  return (
    <aside className="fixed inset-y-0 start-0 z-40 hidden w-[72px] flex-col border-e border-slate-200/80 bg-white md:flex lg:w-64">
      <div className="flex h-16 shrink-0 items-center justify-center lg:justify-start lg:px-5">
        <span className="lg:hidden">
          <Brand href="/home" compact />
        </span>
        <span className="hidden lg:block">
          <Brand href="/home" />
        </span>
      </div>

      <div className="px-3 pb-3 pt-1 lg:px-4">
        <Link
          href="/requests/new"
          title={newLabel}
          aria-label={newLabel}
          className="btn btn-primary h-10 w-full px-0 lg:px-4"
        >
          <Plus size={16} weight="bold" />
          <span className="hidden lg:inline">{newLabel}</span>
        </Link>
      </div>

      <nav aria-label={t("nav.main")} className="scrollbar-none flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2 lg:px-4">
        {sections.map((section, i) => (
          <div key={section.titleKey ?? i} className={i > 0 ? "border-t border-slate-100 pt-4 lg:border-t-0 lg:pt-0" : ""}>
            {section.titleKey && <p className="eyebrow mb-1.5 hidden px-3 text-slate-400 lg:block">{t(section.titleKey)}</p>}
            <ul className="space-y-0.5">
              {section.items.map(({ href, labelKey, icon: Icon }) => {
                const active = href === current;
                const label = t(labelKey);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      title={label}
                      aria-label={label}
                      aria-current={active ? "page" : undefined}
                      className={`group flex h-10 items-center justify-center gap-3 rounded-xl text-sm transition-colors lg:justify-start lg:px-3 ${
                        active
                          ? "bg-primary-50 font-semibold text-primary-700"
                          : "font-medium text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                      }`}
                    >
                      <Icon
                        size={20}
                        weight={active ? "fill" : "regular"}
                        className={`shrink-0 ${active ? "text-primary-600" : "text-slate-400 group-hover:text-slate-600"}`}
                      />
                      <span className="hidden truncate lg:block">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {activeBusinessName && (
        <Link
          href="/business/settings"
          title={activeBusinessName}
          className="m-3 flex items-center justify-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2 transition-colors hover:border-slate-300 hover:bg-white lg:m-4 lg:justify-start lg:p-2.5"
        >
          <Avatar name={activeBusinessName} size="h-9 w-9 text-sm" />
          <span className="hidden min-w-0 lg:block">
            <span className="block truncate text-sm font-semibold text-slate-900">{activeBusinessName}</span>
            <span className="block truncate text-xs text-slate-500">{t("business.settingsTitle")}</span>
          </span>
        </Link>
      )}
    </aside>
  );
}
