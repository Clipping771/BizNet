"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DotsThreeOutline, Plus, X } from "@phosphor-icons/react";
import { useT } from "@/components/ui/T";
import { PRIMARY_NAV, isActivePath, navSections } from "./nav";

interface BottomNavProps {
  isSupplier: boolean;
  isAdmin: boolean;
  hasBusiness: boolean;
  creditsEnabled: boolean;
}

/** Phone tab bar. "More" opens a sheet with every other page, so nothing is out of reach on a phone. */
export function BottomNav({ isSupplier, isAdmin, hasBusiness, creditsEnabled }: BottomNavProps) {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);

  const primary = PRIMARY_NAV.map((i) => i.href);
  const sections = navSections({ isSupplier, isAdmin, hasBusiness, creditsEnabled })
    .map((s) => ({ ...s, items: s.items.filter((i) => !primary.includes(i.href)) }))
    .filter((s) => s.items.length > 0);
  // /requests/inbox is a page of its own in the sheet, not the Requests tab
  const moreHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  const inMore = moreHrefs.some((href) => isActivePath(pathname, href));

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const tab = "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors";

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label={t("nav.more")}>
          <button type="button" aria-label={t("common.close")} onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
          <div id="more-sheet" className="absolute inset-x-0 bottom-0 max-h-[85vh] animate-fade-up overflow-y-auto rounded-t-3xl bg-white pb-safe shadow-pop">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
              <h2 className="section-title">{t("nav.more")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-5 p-4">
              {sections.map((section) => (
                <section key={section.titleKey ?? section.items[0].href}>
                  {section.titleKey && <h3 className="eyebrow mb-2">{t(section.titleKey)}</h3>}
                  <ul className="grid grid-cols-2 gap-2">
                    {section.items.map(({ href, labelKey, icon: Icon }) => (
                      <li key={href}>
                        <Link href={href} className="flex min-h-14 items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-[13px] font-medium text-slate-800 shadow-card active:bg-slate-50">
                          <span className="icon-tile h-8 w-8 rounded-lg">
                            <Icon size={18} />
                          </span>
                          <span className="min-w-0 leading-snug">{t(labelKey)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav aria-label={t("nav.main")} className="fixed bottom-0 start-0 end-0 z-50 border-t border-slate-200/70 bg-white/90 pb-safe backdrop-blur-xl md:hidden">
        <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-1">
          {PRIMARY_NAV.map(({ href, labelKey, icon: Icon }, i) => {
            const active = !open && !inMore && isActivePath(pathname, href);
            return (
              <Fragment key={href}>
                {i === 2 && (
                  <div className="flex flex-1 items-start justify-center">
                    <Link
                      href="/requests/new"
                      id="nav-new-request"
                      aria-label={t("home.newRequest")}
                      className="-mt-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-fab ring-4 ring-white transition-transform active:scale-95"
                    >
                      <Plus size={24} weight="bold" />
                    </Link>
                  </div>
                )}
                <Link href={href} aria-current={active ? "page" : undefined} className={`${tab} ${active ? "font-semibold text-primary-600" : "text-slate-500 hover:text-slate-700"}`}>
                  <Icon size={24} weight={active ? "fill" : "regular"} />
                  <span className="truncate">{t(labelKey)}</span>
                </Link>
              </Fragment>
            );
          })}
          <button
            type="button"
            id="nav-more"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`${tab} ${open || inMore ? "font-semibold text-primary-600" : "text-slate-500 hover:text-slate-700"}`}
          >
            <DotsThreeOutline size={24} weight={open || inMore ? "fill" : "regular"} />
            <span className="truncate">{t("nav.more")}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
