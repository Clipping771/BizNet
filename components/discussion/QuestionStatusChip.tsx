"use client";

import { T } from "@/components/ui/T";

export function QuestionStatusChip({ status }: { status: string }) {
  const tone =
    status === "SOLVED"
      ? "bg-emerald-100 text-emerald-800"
      : status === "PENDING_REVIEW"
      ? "bg-amber-100 text-amber-800"
      : status === "ANSWERED"
      ? "bg-blue-100 text-blue-800"
      : "bg-gray-100 text-gray-700";
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tone}`}>
      <T k={`q.status.${status}`} />
    </span>
  );
}
