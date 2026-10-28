"use client";

import { useCallback, useEffect, useState } from "react";
import { T, useT } from "@/components/ui/T";
import { adminFetch } from "@/components/admin/AdminNav";

const STATUSES = ["DRAFT", "BETA", "ACTIVE", "DISABLED"];

/** Languages (§11): add, auto-draft (TranslationProvider), review/approve, status (ACTIVE needs ≥ 90% critical), JSON export. */
export default function AdminLanguagesPage() {
  const t = useT();
  const [languages, setLanguages] = useState<any[]>([]);
  const [form, setForm] = useState({ code: "", nameNative: "", nameEnglish: "", direction: "ltr", fontFamily: "" });
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetch("/api/admin/languages");
    if (res.ok) setLanguages(res.data.languages);
    else setMessage(res.status === 403 ? t("admin.forbidden") : res.error);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (url: string, init: RequestInit) => {
    const res = await adminFetch(url, init);
    setMessage(res.ok ? t("admin.saved") : res.error);
    await load();
    return res;
  };

  const openReview = async (code: string) => {
    setReviewing(code);
    const res = await adminFetch(`/api/admin/languages/${code}/translations?filter=unapproved`);
    if (res.ok) setRows(res.data.translations);
  };

  const saveRow = async (code: string, key: string, text: string) => {
    const res = await adminFetch(`/api/admin/languages/${code}/translations`, { method: "PUT", body: JSON.stringify({ key, text, approve: true }) });
    setMessage(res.ok ? t("admin.saved") : res.error);
    if (res.ok) await openReview(code);
  };

  return (
    <div className="space-y-3">
      {message && <p className="text-sm text-gray-700">{message}</p>}

      {languages.map((l) => (
        <div key={l.code} data-language={l.code} className="card p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm">
              {l.nameNative}
              {" · "}
              <span className="font-mono text-gray-500">{l.code}</span>
            </span>
            <select
              value={l.status}
              onChange={(e) => act(`/api/admin/languages/${l.code}`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) })}
              aria-label={t("admin.languages.status")}
              className="p-1.5 rounded-lg border border-gray-200 bg-white"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <p className="text-gray-500">
            {t("admin.languages.progress", undefined, { approved: l.approved, total: l.totalKeys, critical: l.criticalApproved, criticalTotal: l.criticalKeys })}
          </p>
          {l.code !== "en" && (
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => act(`/api/admin/languages/${l.code}/auto-draft`, { method: "POST" })} className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold">
                <T k="admin.languages.autoDraft" />
              </button>
              <button
                type="button"
                onClick={() => act(`/api/admin/languages/${l.code}/approve`, { method: "POST", body: JSON.stringify({ criticalOnly: true }) })}
                className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold"
              >
                <T k="admin.languages.approveCritical" />
              </button>
              <button type="button" onClick={() => openReview(l.code)} className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold">
                <T k="admin.languages.review" />
              </button>
              <a href={`/api/admin/languages/${l.code}/export`} className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold">
                <T k="admin.languages.export" />
              </a>
            </div>
          )}
          {reviewing === l.code && (
            <div className="space-y-2 pt-2">
              {rows.map((r) => (
                <div key={r.key} className="border border-gray-100 rounded-lg p-2 space-y-1">
                  <p className="font-mono text-gray-400">{r.key}</p>
                  <p className="text-gray-600">{r.uiString.defaultText}</p>
                  <input
                    dir={l.direction}
                    value={edits[r.key] ?? r.text}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [r.key]: e.target.value }))}
                    aria-label={r.key}
                    className="w-full p-1.5 rounded border border-gray-200"
                  />
                  <button type="button" onClick={() => saveRow(l.code, r.key, edits[r.key] ?? r.text)} className="text-emerald-700 font-semibold">
                    <T k="admin.languages.approve" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await act("/api/admin/languages", { method: "POST", body: JSON.stringify(form) });
          if (res.ok) setForm({ code: "", nameNative: "", nameEnglish: "", direction: "ltr", fontFamily: "" });
        }}
        className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2 text-xs"
      >
        <h2 className="text-sm font-bold text-gray-900">
          <T k="admin.languages.add" />
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {(["code", "nameNative", "nameEnglish", "fontFamily"] as const).map((field) => (
            <input
              key={field}
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              placeholder={t(field === "fontFamily" ? "admin.languages.font" : `admin.languages.${field}`)}
              aria-label={t(field === "fontFamily" ? "admin.languages.font" : `admin.languages.${field}`)}
              className="p-2 rounded-lg border border-gray-200"
            />
          ))}
          <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} aria-label={t("admin.languages.direction")} className="p-2 rounded-lg border border-gray-200 bg-white">
            <option value="ltr">{t("admin.languages.direction")}</option>
            <option value="rtl">{t("admin.languages.direction")}</option>
          </select>
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-gray-900 text-white font-semibold">
          <T k="admin.languages.add" />
        </button>
      </form>
    </div>
  );
}
