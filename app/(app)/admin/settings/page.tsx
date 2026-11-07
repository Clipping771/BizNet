"use client";

import { useEffect, useState } from "react";
import { T, useT } from "@/components/ui/T";
import { ListSkeleton } from "@/components/ui/ListStates";
import { adminFetch } from "@/components/admin/AdminNav";

/** Settings shown together, in the order an admin thinks about them. New keys land in "Other". */
const GROUPS: { k: string; keys: string[] }[] = [
  { k: "ai", keys: ["aiEnabled", "aiRequestAssistantEnabled", "aiQuoteComparisonEnabled", "aiDailyBudgetUsd", "aiDailyRequestsPerUser", "aiTimeoutMs", "aiProviderModelRequest", "aiProviderModelCompare"] },
  { k: "aiHelpers", keys: ["aiListingWriterEnabled", "aiQuoteAssistantEnabled", "aiDiscussionAnswersEnabled", "aiMarketInsightEnabled", "aiSemanticSearchEnabled", "aiTrustSignalsEnabled"] },
  { k: "marketplace", keys: ["matchingRadiusKm", "maxInvitesPerRequest", "maxQuotesPerRequest", "defaultQuoteWindowHours", "maxOpenRequestsPerBusiness", "reliabilityMinFeedbacks"] },
  { k: "moderation", keys: ["prohibitedItems", "sellingFilterTerms"] },
  { k: "prices", keys: ["marketPriceMinQuotes", "marketPriceMinSuppliers"] },
  { k: "credits", keys: ["leadCreditsEnabled", "freeTrialCredits", "creditPacks", "paymentReceivers"] },
  { k: "translation", keys: ["translationEnabled", "translationDailyBudgetUsd"] },
  { k: "quality", keys: ["metricThresholds", "evalMinCategoryAccuracy", "evalMinFieldAccuracy"] },
];
const HIDDEN = new Set(["latestEvalReport", "aiDisabledUntilDay"]);

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

  // A key without its own label still shows, under its technical name
  const labelOf = (key: string) => {
    const label = t(`setting.${key}.label`);
    return label === `setting.${key}.label` ? key : label;
  };
  const helpOf = (key: string) => {
    const help = t(`setting.${key}.help`);
    return help === `setting.${key}.help` ? null : help;
  };

  const known = new Set(GROUPS.flatMap((g) => g.keys));
  const present = Object.keys(settings).filter((k) => !HIDDEN.has(k));
  const groups = [...GROUPS.map((g) => ({ k: g.k, keys: g.keys.filter((key) => key in settings) })), { k: "other", keys: present.filter((key) => !known.has(key)) }].filter((g) => g.keys.length > 0);

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-slate-500">
        <T k="admin.settings.help" />
      </p>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {!error && groups.length === 0 && <ListSkeleton />}

      {groups.map((group) => (
        <section key={group.k} data-setting-group={group.k} className="card overflow-hidden">
          <h2 className="card-header section-title">
            <T k={`setting.group.${group.k}`} />
          </h2>
          <div className="divide-y divide-slate-100">
            {group.keys.map((key) => {
              const value = settings[key];
              const isObject = typeof value === "object" && value !== null;
              const help = helpOf(key);
              const dirty = drafts[key] !== (isObject ? JSON.stringify(value, null, 2) : String(value));
              const onChange = (next: string) => setDrafts((d) => ({ ...d, [key]: next }));
              return (
                <div key={key} data-setting={key} className={`gap-4 px-4 py-3 ${isObject ? "space-y-2" : "flex flex-col sm:flex-row sm:items-center"}`}>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`setting-${key}`} className="block text-sm font-medium text-slate-900">
                      {labelOf(key)}
                    </label>
                    {help && <p className="mt-0.5 text-xs text-slate-500">{help}</p>}
                  </div>
                  <div className={`flex items-center gap-2 ${isObject ? "flex-wrap" : "shrink-0"}`}>
                    {typeof value === "boolean" ? (
                      <select id={`setting-${key}`} value={drafts[key]} onChange={(e) => onChange(e.target.value)} className="input w-24">
                        <option value="true">{t("common.yes")}</option>
                        <option value="false">{t("common.no")}</option>
                      </select>
                    ) : isObject ? (
                      <textarea
                        id={`setting-${key}`}
                        rows={4}
                        value={drafts[key]}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm placeholder:text-slate-400 hover:border-slate-400 font-mono"
                      />
                    ) : (
                      <input id={`setting-${key}`} value={drafts[key] ?? ""} onChange={(e) => onChange(e.target.value)} className={`input ${typeof value === "number" ? "w-28" : "w-52"}`} />
                    )}
                    <button type="button" onClick={() => save(key)} className={`btn btn-sm ${dirty ? "btn-primary" : "btn-secondary"}`}>
                      <T k="admin.save" />
                    </button>
                    {messages[key] && <span className="text-xs text-slate-600">{messages[key]}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
