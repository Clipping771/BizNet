"use client";

import Link from "next/link";
import { useT } from "@/components/ui/T";

/** Logo mark + wordmark. */
export function Brand({ href = "/home", compact = false, inverted = false }: { href?: string; compact?: boolean; inverted?: boolean }) {
  const t = useT();
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label={t("app.title")}>
      <span className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl ${inverted ? "bg-white/15 ring-1 ring-inset ring-white/25" : "bg-gradient-to-br from-primary-500 to-primary-800 shadow-sm shadow-primary/30"} text-white`}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" />
          <path d="M4 8.5 12 13l8-4.5M12 13v7" />
        </svg>
      </span>
      {!compact && <span className={`text-[17px] font-bold tracking-tight ${inverted ? "text-white" : "text-gray-900"}`}>{t("app.title")}</span>}
    </Link>
  );
}
