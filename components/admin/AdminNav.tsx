"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { T } from "@/components/ui/T";

const LINKS: Array<[href: string, key: string]> = [
  ["/admin", "admin.nav.dashboard"],
  ["/admin/verifications", "admin.nav.verifications"],
  ["/admin/reports", "admin.nav.reports"],
  ["/admin/businesses", "admin.nav.businesses"],
  ["/admin/requests", "admin.nav.requests"],
  ["/admin/concierge", "admin.nav.concierge"],
  ["/admin/categories", "admin.nav.categories"],
  ["/admin/market-prices", "admin.nav.marketPrices"],
  ["/admin/languages", "admin.nav.languages"],
  ["/admin/payments", "admin.nav.payments"],
  ["/admin/settings", "admin.nav.settings"],
  ["/admin/ops-time", "admin.nav.opsTime"],
  ["/admin/export", "admin.nav.export"],
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-4 flex gap-1 overflow-x-auto border-b border-gray-200 px-4 text-sm scrollbar-none sm:mx-0 sm:px-0">
      {LINKS.map(([href, key]) => {
        const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 font-medium transition-colors ${
              active ? "border-primary text-primary-800" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
            }`}
          >
            <T k={key} />
          </Link>
        );
      })}
    </nav>
  );
}

/** Fetch helper for admin pages: JSON or a readable error. */
export async function adminFetch<T = any>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || res.statusText, status: res.status };
  return { ok: true, data };
}
