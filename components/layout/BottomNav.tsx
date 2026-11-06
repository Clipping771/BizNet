"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/components/ui/T";
import { PRIMARY_NAV, isActivePath } from "./nav";

/** Phone tab bar: filled icon on the active tab; the top bar carries the tabs from md up. */
export function BottomNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav aria-label={t("nav.main")} className="fixed bottom-0 start-0 end-0 z-50 border-t border-slate-200/80 bg-white/90 pb-safe backdrop-blur-xl md:hidden">
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around">
        {PRIMARY_NAV.map(({ href, labelKey, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 my-1.5 rounded-xl text-[11px] transition-colors ${
                active ? "bg-teal-50 font-semibold text-teal-800" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={24} weight={active ? "fill" : "regular"} />
              <span className="truncate">{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
