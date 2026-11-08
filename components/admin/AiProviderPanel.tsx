"use client";

import { useState } from "react";
import { CheckCircle, CircleNotch, Plugs, WarningCircle } from "@phosphor-icons/react";
import { useLang, useT } from "@/components/ui/T";
import { adminFetch } from "@/components/admin/AdminNav";
import { formatNumber } from "@/lib/money";
import type { AiTestResult } from "@/lib/ai/testConnection";

const PROVIDERS = ["env", "mock", "anthropic", "ollama"] as const;

interface ModelRow {
  name: string;
  parameterSize?: string;
  sizeBytes?: number;
}

/**
 * AI provider picker with Ollama's server and model, plus a live connection test.
 * Saves the three settings through the same audited settings API as every other setting.
 */
export function AiProviderPanel({
  initial,
  onSaved,
}: {
  initial: { aiProvider: string; ollamaBaseUrl: string; ollamaModel: string };
  onSaved: (values: Record<string, string>) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [provider, setProvider] = useState(initial.aiProvider || "env");
  const [baseUrl, setBaseUrl] = useState(initial.ollamaBaseUrl || "");
  const [model, setModel] = useState(initial.ollamaModel || "");
  const [models, setModels] = useState<ModelRow[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<AiTestResult | null>(null);

  const dirty = provider !== (initial.aiProvider || "env") || baseUrl !== (initial.ollamaBaseUrl || "") || model !== (initial.ollamaModel || "");
  const isOllama = provider === "ollama";

  const loadModels = async () => {
    setLoadingModels(true);
    setModelsError(null);
    const res = await adminFetch<{ models: ModelRow[]; error?: string }>(`/api/admin/ai/models?baseUrl=${encodeURIComponent(baseUrl)}`);
    setLoadingModels(false);
    if (res.ok) {
      setModels(res.data.models);
      if (!model && res.data.models[0]) setModel(res.data.models[0].name);
    } else {
      setModels([]);
      setModelsError(res.error);
    }
  };

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    const values: Record<string, string> = { aiProvider: provider, ollamaBaseUrl: baseUrl.trim(), ollamaModel: model.trim() };
    for (const [key, value] of Object.entries(values)) {
      const res = await adminFetch("/api/admin/settings", { method: "PUT", body: JSON.stringify({ key, value }) });
      if (!res.ok) {
        setSaving(false);
        setSaveMsg(res.error);
        return;
      }
    }
    setSaving(false);
    setSaveMsg(t("admin.saved"));
    onSaved(values);
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    const res = await adminFetch<AiTestResult>("/api/admin/ai/test", {
      method: "POST",
      body: JSON.stringify({ provider, ollamaBaseUrl: baseUrl, ollamaModel: model }),
    });
    setTesting(false);
    setResult(res.ok ? res.data : { ok: false, provider, failedAt: "connect", error: res.error });
  };

  // Cloud models are tiny local stubs: show a size only for real downloads
  const sizeGb = (bytes?: number) => (bytes && bytes >= 1e8 ? `${formatNumber(Math.round((bytes / 1e9) * 10) / 10, lang)} GB` : "");

  return (
    <section id="ai-provider-panel" data-setting-group="aiProvider" className="card overflow-hidden">
      <div className="card-header">
        <h2 className="section-title">{t("admin.ai.title")}</h2>
        {!dirty && <span className="text-xs text-slate-500">{t(`admin.ai.provider.${initial.aiProvider || "env"}`)}</span>}
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <label htmlFor="ai-provider" className="label">
            {t("admin.ai.providerLabel")}
          </label>
          <select id="ai-provider" value={provider} onChange={(e) => { setProvider(e.target.value); setResult(null); }} className="input sm:max-w-sm">
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {t(`admin.ai.provider.${p}`)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{t(`admin.ai.providerHelp.${provider}`)}</p>
        </div>

        {isOllama && (
          <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-2">
            <div>
              <label htmlFor="ollama-url" className="label">
                {t("admin.ai.ollamaUrl")}
              </label>
              <div className="flex gap-2">
                <input
                  id="ollama-url"
                  value={baseUrl}
                  onChange={(e) => { setBaseUrl(e.target.value); setModels(null); }}
                  placeholder="http://localhost:11434"
                  className="input font-mono"
                  spellCheck={false}
                />
                <button type="button" id="ollama-load-models" onClick={loadModels} disabled={loadingModels} className="btn btn-secondary shrink-0">
                  {loadingModels ? <CircleNotch size={16} className="animate-spin" /> : null}
                  {t("admin.ai.loadModels")}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">{t("admin.ai.ollamaUrlHelp")}</p>
              {modelsError && <p className="mt-1 text-xs text-rose-700">{modelsError}</p>}
            </div>

            <div>
              <label htmlFor="ollama-model" className="label">
                {t("admin.ai.ollamaModel")}
              </label>
              {models && models.length > 0 ? (
                <select id="ollama-model" value={model} onChange={(e) => setModel(e.target.value)} className="input font-mono">
                  {!models.some((m) => m.name === model) && model && <option value={model}>{model}</option>}
                  {models.map((m) => (
                    <option key={m.name} value={m.name}>
                      {[m.name, m.parameterSize, sizeGb(m.sizeBytes)].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="ollama-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="llama3.1"
                  className="input font-mono"
                  spellCheck={false}
                />
              )}
              <p className="mt-1 text-xs text-slate-500">
                {models && models.length === 0 && !modelsError ? t("admin.ai.noModels") : t("admin.ai.ollamaModelHelp")}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" id="ai-provider-save" onClick={save} disabled={saving || !dirty} className="btn btn-primary">
            {saving ? <CircleNotch size={16} className="animate-spin" /> : null}
            {t("admin.save")}
          </button>
          <button type="button" id="ai-provider-test" onClick={test} disabled={testing} className="btn btn-secondary">
            {testing ? <CircleNotch size={16} className="animate-spin" /> : <Plugs size={16} />}
            {testing ? t("admin.ai.testing") : t("admin.ai.test")}
          </button>
          {saveMsg && <span className="text-xs text-slate-600">{saveMsg}</span>}
          {dirty && !saveMsg && <span className="text-xs text-slate-500">{t("admin.ai.testBeforeSave")}</span>}
        </div>

        {result && (
          <div
            id="ai-test-result"
            data-ok={result.ok ? "true" : "false"}
            role="status"
            className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}
          >
            {result.ok ? <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-emerald-600" /> : <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-rose-600" />}
            <div className="min-w-0 space-y-1">
              <p className="font-semibold">
                {result.ok ? t("admin.ai.testOk") : t(`admin.ai.testFailed.${result.failedAt ?? "connect"}`)}
              </p>
              <p className="text-xs opacity-90">
                {t("admin.ai.testDetails", undefined, {
                  provider: t(`admin.ai.provider.${result.provider}`),
                  model: result.model ?? "—",
                  ms: result.latencyMs !== undefined ? formatNumber(result.latencyMs, lang) : "—",
                })}
              </p>
              {result.ok && result.reply && (
                <p className="break-words text-xs">
                  {t("admin.ai.testReply")} <span className="font-mono">{result.reply}</span>
                </p>
              )}
              {result.models && (
                <p className="text-xs">{t("admin.ai.modelsFound", undefined, { n: formatNumber(result.models.length, lang) })}</p>
              )}
              {result.error && <p className="break-words font-mono text-xs">{result.error}</p>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
