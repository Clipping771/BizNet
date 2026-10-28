"use client";

import { useCallback, useEffect, useState } from "react";
import { T, useT } from "@/components/ui/T";
import { adminFetch } from "@/components/admin/AdminNav";

/** Moderation: open reports (messages, answers, AI output, disputes, zero-match) and held questions. */
export default function AdminReportsPage() {
  const t = useT();
  const [reports, setReports] = useState<any[]>([]);
  const [held, setHeld] = useState<any[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetch("/api/admin/reports");
    if (res.ok) {
      setReports(res.data.reports);
      setHeld(res.data.heldQuestions);
    } else setError(res.status === 403 ? t("admin.forbidden") : res.error);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (id: string, status: string) => {
    const res = await adminFetch(`/api/admin/reports/${id}`, { method: "POST", body: JSON.stringify({ status, note: notes[id] || null }) });
    if (!res.ok) setError(res.error);
    await load();
  };

  const review = async (id: string, approve: boolean) => {
    const res = await adminFetch(`/api/admin/questions/${id}/review`, { method: "POST", body: JSON.stringify({ approve }) });
    if (!res.ok) setError(res.error);
    await load();
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="card p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">
          <T k="admin.reports.held" />
        </h2>
        {held.length === 0 && (
          <p className="text-xs text-gray-400">
            <T k="admin.reports.none" />
          </p>
        )}
        {held.map((q) => (
          <div key={q.id} data-held-question={q.id} className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2 text-xs">
            <p className="font-semibold text-gray-900">{q.title}</p>
            <p className="text-gray-700 whitespace-pre-wrap">{q.body}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => review(q.id, true)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold">
                <T k="admin.reports.approve" />
              </button>
              <button type="button" onClick={() => review(q.id, false)} className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 font-semibold">
                <T k="admin.reports.reject" />
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">
          <T k="admin.reports.open" />
        </h2>
        {reports.length === 0 && (
          <p className="text-xs text-gray-400">
            <T k="admin.reports.none" />
          </p>
        )}
        {reports.map((r) => (
          <div key={r.id} data-report={r.id} className="border border-gray-100 rounded-xl p-3 space-y-2 text-xs">
            <div className="flex justify-between gap-2">
              <span className="font-mono font-semibold">{r.targetType}</span>
              <span className="text-gray-400">{new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")}</span>
            </div>
            <p className="text-gray-700">
              {r.reason}
              {r.details ? ` — ${r.details}` : ""}
            </p>
            <p className="text-gray-400 font-mono break-all">{r.targetId}</p>
            <input
              value={notes[r.id] || ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
              placeholder={t("admin.reports.note")}
              aria-label={t("admin.reports.note")}
              className="w-full p-2 rounded-lg border border-gray-200"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => resolve(r.id, "ACTION_TAKEN")} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white font-semibold">
                <T k="admin.reports.actionTaken" />
              </button>
              <button type="button" onClick={() => resolve(r.id, "DISMISSED")} className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold">
                <T k="admin.reports.dismiss" />
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
