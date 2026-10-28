"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/components/ui/T";
import { PRIMARY_NAV, isActivePath } from "./nav";

/** Phone navigation bar (Material 3); the rail replaces it from the lg breakpoint. */
export function BottomNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav aria-label={t("nav.main")} className="fixed bottom-0 start-0 end-0 z-50 bg-[#EEF1F4] pb-safe lg:hidden">
      <div className="mx-auto flex h-[72px] max-w-xl items-stretch justify-around">
        {PRIMARY_NAV.map(({ href, labelKey, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`group flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors ${
                active ? "font-semibold text-gray-900" : "font-medium text-gray-600"
              }`}
            >
              <span
                className={`flex h-8 w-16 items-center justify-center rounded-full transition-colors duration-200 ${
                  active ? "bg-primary-100 text-primary-900" : "group-hover:bg-gray-300/40"
                }`}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
              </span>
              <span>{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
