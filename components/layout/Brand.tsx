"use client";

import Link from "next/link";
import { useT } from "@/components/ui/T";

/** Logo mark + wordmark; `compact` shows only the mark (the app top bar, like other networks). */
export function Brand({ href = "/home", compact = false, inverted = false }: { href?: string; compact?: boolean; inverted?: boolean }) {
  const t = useT();
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2" aria-label={t("app.title")}>
      <span
        className={`flex h-[34px] w-[34px] items-center justify-center rounded-[10px] ${
          inverted ? "bg-white text-teal-700" : "bg-teal-700 text-white shadow-sm shadow-teal-900/20"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" />
          <path d="M4 8.5 12 13l8-4.5M12 13v7" />
        </svg>
      </span>
      {!compact && <span className={`text-xl font-bold tracking-tight ${inverted ? "text-white" : "text-slate-900"}`}>{t("app.title")}</span>}
    </Link>
  );
}
