"use client";

import { T } from "@/components/ui/T";

/** Shared loading skeleton and empty state for list screens. */
export function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 rounded-2xl bg-white border border-gray-100 animate-pulse" />
      ))}
    </div>
  );
}

export function EmptyState({ k, children }: { k: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-3">
      <p className="text-sm text-gray-500">
        <T k={k} />
      </p>
      {children}
    </div>
  );
}

export function StatusChip({ k, tone = "gray" }: { k: string; tone?: "gray" | "green" | "amber" | "red" | "blue" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-rose-100 text-rose-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${tones[tone]}`}>
      <T k={k} />
    </span>
  );
}
