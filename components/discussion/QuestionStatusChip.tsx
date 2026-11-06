"use client";

import { T } from "@/components/ui/T";

export function QuestionStatusChip({ status }: { status: string }) {
  const tone =
    status === "SOLVED"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
      : status === "PENDING_REVIEW"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
      : status === "ANSWERED"
      ? "bg-primary-500/10 text-primary-700 dark:text-primary-300 border-primary-500/20"
      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/80";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${tone}`}>
      <T k={`q.status.${status}`} />
    </span>
  );
}
