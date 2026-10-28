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
          <div className="h-10 w-10 animate-pulse rounded-full bg-gray-100" />
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
    <div className="card flex flex-col items-center gap-4 px-6 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <Icon className="h-7 w-7" strokeWidth={1.6} />
      </span>
      <p className="max-w-sm text-[15px] text-gray-600">
        <T k={k} />
      </p>
      {children}
    </div>
  );
}

// Google-style tonal status colours
const TONES: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-[#E6F4EA] text-[#137333]",
  amber: "bg-[#FEF7E0] text-[#B06000]",
  red: "bg-[#FCE8E6] text-[#C5221F]",
  blue: "bg-[#E8F0FE] text-[#1967D2]",
  violet: "bg-[#F3E8FD] text-[#8430CE]",
};

export function StatusChip({ k, tone = "gray" }: { k: string; tone?: Tone }) {
  return (
    <span className={`inline-flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium ${TONES[tone]}`}>
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
