"use client";

import { useCallback, useEffect, useState } from "react";
import { T, useT } from "@/components/ui/T";
import { VerificationBadge } from "@/components/business/VerificationBadge";
import { adminFetch } from "@/components/admin/AdminNav";

/** Businesses: search, suspend / reinstate (with ops minutes, audited), ban members. */
export default function AdminBusinessesPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [minutes, setMinutes] = useState("5");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetch(`/api/admin/businesses?q=${encodeURIComponent(q)}`);
    if (res.ok) setRows(res.data.businesses);
    else setError(res.status === 403 ? t("admin.forbidden") : res.error);
  }, [q, t]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStatus = async (id: string, status: string) => {
    setError(null);
    const res = await adminFetch(`/api/admin/businesses/${id}/status`, { method: "POST", body: JSON.stringify({ status, minutes: Number(minutes) }) });
    if (!res.ok) setError(res.error);
    await load();
  };

  const ban = async (userId: string, banned: boolean) => {
    const res = await adminFetch(`/api/admin/users/${userId}/ban`, { method: "POST", body: JSON.stringify({ banned }) });
    if (!res.ok) setError(res.error);
    await load();
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="flex gap-2"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.businesses.search")} aria-label={t("admin.businesses.search")} className="input flex-1" />
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <span>
            <T k="admin.businesses.minutes" />
          </span>
          <input type="number" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="input w-16" />
        </label>
      </form>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {rows.map((b) => (
        <div key={b.id} data-admin-business={b.slug} className="card p-4 space-y-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-slate-900">{b.name}</span>
            <VerificationBadge status={b.verificationStatus} />
            <span className="text-slate-500">{b.area}</span>
          </div>
          <p className="text-slate-500">
            {t("admin.businesses.counts", undefined, { listings: b._count.listings, requests: b._count.requestsAsBuyer, quotes: b._count.quotes })}
          </p>
          <div className="flex gap-2 flex-wrap">
            {b.verificationStatus !== "SUSPENDED" ? (
              <button type="button" onClick={() => setStatus(b.id, "SUSPENDED")} className="btn btn-secondary text-rose-700 btn-sm">
                <T k="admin.businesses.suspend" />
              </button>
            ) : (
              <button type="button" onClick={() => setStatus(b.id, "BASIC")} className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 font-semibold">
                <T k="admin.businesses.reinstate" />
              </button>
            )}
          </div>
          <ul className="space-y-1">
            {b.members.map((m: any) => (
              <li key={m.user.id} className="flex items-center justify-between gap-2">
                <span>
                  {m.user.name}
                  {" · "}
                  {m.role}
                </span>
                <button type="button" onClick={() => ban(m.user.id, !m.user.isBanned)} className="text-rose-700 font-semibold">
                  <T k={m.user.isBanned ? "admin.businesses.unban" : "admin.businesses.ban"} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
