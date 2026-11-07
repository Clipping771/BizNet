"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/components/ui/T";
import { Brand } from "./Brand";
import { navSections, type NavItem } from "./nav";

interface SidebarProps {
  isSupplier: boolean;
  isAdmin: boolean;
  hasBusiness: boolean;
  creditsEnabled: boolean;
}

/** The longest matching href wins, so /requests/inbox lights up its own row and not /requests. */
function activeHref(pathname: string, items: NavItem[]): string | undefined {
  return items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/** Fixed navy navigation column, grouped by job: trade, market, selling, business. */
export function Sidebar({ isSupplier, isAdmin, hasBusiness, creditsEnabled }: SidebarProps) {
  const t = useT();
  const pathname = usePathname();
  const sections = navSections({ isSupplier, isAdmin, hasBusiness, creditsEnabled });
  const current = activeHref(pathname, sections.flatMap((s) => s.items));

  return (
    <aside className="fixed inset-y-0 start-0 z-40 hidden w-56 flex-col bg-primary-950 md:flex">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Brand href="/home" inverted />
      </div>
      <nav aria-label={t("nav.main")} className="scrollbar-none flex-1 space-y-5 overflow-y-auto px-2.5 pb-6 pt-3">
        {sections.map((section, i) => (
          <div key={section.titleKey ?? i}>
            {section.titleKey && <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-primary-300/70">{t(section.titleKey)}</p>}
            <ul className="space-y-0.5">
              {section.items.map(({ href, labelKey, icon: Icon }) => {
                const active = href === current;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors ${
                        active ? "bg-white/10 font-medium text-white" : "text-primary-100/80 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {active && <span aria-hidden="true" className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-amber-400" />}
                      <Icon size={18} weight={active ? "fill" : "regular"} className="shrink-0" />
                      <span className="truncate">{t(labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
