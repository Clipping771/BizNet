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
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("admin.languages.status")} className="input">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? t(`reqStatus.${s}`) : t("search.any")}
            </option>
          ))}
        </select>
        <Link href="/admin/concierge" className="btn btn-primary btn-sm">
          <T k="admin.nav.concierge" />
        </Link>
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {rows.map((r) => (
        <Link key={r.id} href={`/requests/${r.code}`} className="block card p-3 text-xs space-y-1">
          <div className="flex justify-between gap-2">
            <span className="font-mono text-slate-500">{r.code}</span>
            <span className="font-semibold">{t(`reqStatus.${r.status}`)}</span>
          </div>
          <p className="font-semibold text-slate-900">{r.title}</p>
          <p className="text-slate-500">
            {r.buyerBusiness.name}
            {" · "}
            {t(`category.${r.category.slug}`)}
            {" · "}
            {r.deliveryArea}
            {r.createdViaConcierge ? ` · ${t("admin.requests.concierge")}` : ""}
          </p>
          <p className="text-slate-500">{t("admin.requests.counts", undefined, { invites: r._count.invites, quotes: r._count.quotes })}</p>
        </Link>
      ))}
    </div>
  );
}
