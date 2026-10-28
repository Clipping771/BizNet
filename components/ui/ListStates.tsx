"use client";

import { Inbox, type LucideIcon } from "lucide-react";
import { T } from "@/components/ui/T";

export type Tone = "gray" | "green" | "amber" | "red" | "blue" | "violet";

export const REQUEST_STATUS_TONE: Record<string, Tone> = {
  OPEN: "green",
  AWARDED: "blue",
  CLOSED: "gray",
  EXPIRED: "gray",
  CANCELLED: "red",
};

/** Shared loading skeleton and empty state for list screens. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card flex items-center gap-3 p-4">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ k, icon: Icon = Inbox, children }: { k: string; icon?: LucideIcon; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
        <Icon className="h-6 w-6" />
      </span>
      <p className="max-w-xs text-sm text-gray-500">
        <T k={k} />
      </p>
      {children}
    </div>
  );
}

const TONES: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function StatusChip({ k, tone = "gray" }: { k: string; tone?: Tone }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONES[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      <T k={k} />
    </span>
  );
}

/** Title row used at the top of app pages. */
export function PageHeader({ titleKey, subtitleKey, children }: { titleKey: string; subtitleKey?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title">
          <T k={titleKey} />
        </h1>
        {subtitleKey && (
          <p className="page-subtitle">
            <T k={subtitleKey} />
          </p>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
