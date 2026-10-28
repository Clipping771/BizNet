"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { useT } from "@/components/ui/T";

/** Extended floating action button for a new request on phones (the rail has it on desktop). */
export function Fab() {
  const t = useT();
  return (
    <Link
      href="/requests/new"
      id="fab-new-request"
      className="fixed bottom-[88px] end-4 z-40 inline-flex h-14 items-center gap-3 rounded-2xl bg-primary-100 pe-5 ps-4 text-sm font-medium text-primary-900 shadow-fab transition-shadow active:shadow-raised lg:hidden"
    >
      <Pencil className="h-5 w-5" />
      {t("home.newRequest")}
    </Link>
  );
}
