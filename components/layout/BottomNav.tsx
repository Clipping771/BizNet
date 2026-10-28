"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/components/ui/T";
import { PRIMARY_NAV, isActivePath } from "./nav";

/** Phone tab bar; the sidebar replaces it from the lg breakpoint. */
export function BottomNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav
      aria-label={t("nav.main")}
      className="fixed bottom-0 start-0 end-0 z-50 border-t border-gray-200/70 bg-white/95 shadow-nav backdrop-blur-md pb-safe lg:hidden"
    >
      <div className="mx-auto flex h-16 max-w-xl items-stretch justify-around px-1">
        {PRIMARY_NAV.map(({ href, labelKey, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`group flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active ? "text-primary-700" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-primary-100" : "group-hover:bg-gray-100"
                }`}
              >
                <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.4 : 2} />
              </span>
              <span className={active ? "font-semibold" : undefined}>{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
