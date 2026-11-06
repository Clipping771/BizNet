"use client";

import Link from "next/link";
import { Plus } from "@phosphor-icons/react";
import { useT } from "@/components/ui/T";

/** Floating "new request" button on phones; desktop has the button in the page header. */
export function Fab() {
  const t = useT();
  return (
    <Link
      href="/requests/new"
      id="fab-new-request"
      aria-label={t("home.newRequest")}
      className="fixed bottom-[72px] end-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-fab transition-colors active:bg-primary-700 md:hidden"
    >
      <Plus size={24} weight="bold" />
    </Link>
  );
}
