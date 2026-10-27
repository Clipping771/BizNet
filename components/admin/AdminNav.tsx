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
  ["/admin/settings", "admin.nav.settings"],
  ["/admin/ops-time", "admin.nav.opsTime"],
  ["/admin/export", "admin.nav.export"],
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
      {LINKS.map(([href, key]) => {
        const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`shrink-0 px-3 py-2 rounded-full border font-semibold ${
              active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200"
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
