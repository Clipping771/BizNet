"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { T, useT } from "@/components/ui/T";
import { adminFetch } from "@/components/admin/AdminNav";

const STATUSES = ["", "OPEN", "CLOSED", "AWARDED", "CANCELLED", "EXPIRED"];

/** Requests overview; concierge entry (request for a buyer / quote for a supplier) lives on /admin/concierge. */
export default function AdminRequestsPage() {
  const t = useT();
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch(`/api/admin/requests?status=${status}`).then((res) => {
      if (res.ok) setRows(res.data.requests);
      else setError(res.status === 403 ? t("admin.forbidden") : res.error);
    });
  }, [status, t]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("admin.languages.status")} className="p-2 rounded-lg border border-gray-200 text-xs bg-white">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? t(`reqStatus.${s}`) : t("search.any")}
            </option>
          ))}
        </select>
        <Link href="/admin/concierge" className="px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold">
          <T k="admin.nav.concierge" />
        </Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows.map((r) => (
        <Link key={r.id} href={`/requests/${r.code}`} className="block card p-3 text-xs space-y-1">
          <div className="flex justify-between gap-2">
            <span className="font-mono text-gray-400">{r.code}</span>
            <span className="font-semibold">{t(`reqStatus.${r.status}`)}</span>
          </div>
          <p className="font-semibold text-gray-900">{r.title}</p>
          <p className="text-gray-500">
            {r.buyerBusiness.name}
            {" · "}
            {t(`category.${r.category.slug}`)}
            {" · "}
            {r.deliveryArea}
            {r.createdViaConcierge ? ` · ${t("admin.requests.concierge")}` : ""}
          </p>
          <p className="text-gray-500">{t("admin.requests.counts", undefined, { invites: r._count.invites, quotes: r._count.quotes })}</p>
        </Link>
      ))}
    </div>
  );
}
