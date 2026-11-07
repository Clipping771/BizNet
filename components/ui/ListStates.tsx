"use client";

import { Inbox, type LucideIcon } from "lucide-react";
import { T } from "@/components/ui/T";

import type { Tone } from "@/lib/status-tones";

export type { Tone };
export { REQUEST_STATUS_TONE, ORDER_STATUS_TONE } from "@/lib/status-tones";

/** Shared loading skeleton and empty state for list screens. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card flex items-center gap-3 p-4">
          <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ k, icon: Icon = Inbox, children }: { k: string; icon?: LucideIcon; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
        <Icon className="h-6 w-6" strokeWidth={1.7} />
      </span>
      <p className="max-w-sm text-sm text-slate-600">
        <T k={k} />
      </p>
      {children}
    </div>
  );
}

const TONES: Record<Tone, string> = {
  gray: "text-slate-600 [--dot:theme(colors.slate.400)]",
  green: "text-emerald-700 [--dot:theme(colors.emerald.500)]",
  amber: "text-amber-700 [--dot:theme(colors.amber.500)]",
  red: "text-rose-700 [--dot:theme(colors.rose.500)]",
  blue: "text-primary-700 [--dot:theme(colors.primary.500)]",
  violet: "text-violet-700 [--dot:theme(colors.violet.500)]",
};

export function StatusChip({ k, tone = "gray" }: { k: string; tone?: Tone }) {
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium ${TONES[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--dot)]" aria-hidden="true" />
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
