"use client";

import { useEffect, useState } from "react";
import { T, useT } from "@/components/ui/T";
import { adminFetch } from "@/components/admin/AdminNav";

/** Typed, audited settings (§9). Scalars get inputs; lists and objects are edited as JSON. */
export default function AdminSettingsPage() {
  const t = useT();
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch("/api/admin/settings").then((res) => {
      if (!res.ok) return setError(res.status === 403 ? t("admin.forbidden") : res.error);
      setSettings(res.data.settings);
      setDrafts(
        Object.fromEntries(
          Object.entries(res.data.settings as Record<string, unknown>).map(([k, v]) => [k, typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : String(v)])
        )
      );
    });
  }, [t]);

  const save = async (key: string) => {
    const original = settings[key];
    let value: unknown = drafts[key];
    try {
      if (typeof original === "number") value = Number(drafts[key]);
      else if (typeof original === "boolean") value = drafts[key] === "true";
      else if (typeof original === "object") value = JSON.parse(drafts[key]);
    } catch {
      setMessages((m) => ({ ...m, [key]: t("admin.categories.invalidJson") }));
      return;
    }
    const res = await adminFetch("/api/admin/settings", { method: "PUT", body: JSON.stringify({ key, value }) });
    setMessages((m) => ({ ...m, [key]: res.ok ? t("admin.saved") : res.error }));
    if (res.ok) setSettings((s) => ({ ...s, [key]: value }));
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        <T k="admin.settings.help" />
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {Object.entries(settings)
        .filter(([key]) => key !== "latestEvalReport")
        .map(([key, value]) => (
          <div key={key} data-setting={key} className="bg-white rounded-xl border border-gray-100 p-3 text-xs space-y-1.5">
            <label htmlFor={`setting-${key}`} className="font-mono font-semibold text-gray-800 block">
              {key}
            </label>
            {typeof value === "boolean" ? (
              <select id={`setting-${key}`} value={drafts[key]} onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))} className="p-2 rounded-lg border border-gray-200 bg-white">
                <option value="true">{t("common.yes")}</option>
                <option value="false">{t("common.no")}</option>
              </select>
            ) : typeof value === "object" && value !== null ? (
              <textarea id={`setting-${key}`} rows={4} value={drafts[key]} onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))} className="w-full p-2 rounded-lg border border-gray-200 font-mono text-xs" />
            ) : (
              <input id={`setting-${key}`} value={drafts[key] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))} className="w-full p-2 rounded-lg border border-gray-200" />
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => save(key)} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white font-semibold">
                <T k="admin.save" />
              </button>
              {messages[key] && <span className="text-gray-600">{messages[key]}</span>}
            </div>
          </div>
        ))}
    </div>
  );
}
