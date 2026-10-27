"use client";

import { useEffect, useState } from "react";
import { Check, Globe } from "lucide-react";
import { T, useLang, useT } from "@/components/ui/T";

interface LanguageRow {
  code: string;
  nameNative: string;
  nameEnglish: string;
  status: string;
  direction: string;
}

/** Language picker (§11): languages come from the database; choosing one sets the cookie the layout reads. */
export default function LanguagePage() {
  const t = useT();
  const current = useLang();
  const [languages, setLanguages] = useState<LanguageRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/languages")
      .then((r) => r.json())
      .then((d) => setLanguages(d.languages || []))
      .catch(() => setLanguages([]));
  }, []);

  const choose = async (code: string) => {
    setSaving(code);
    setError(null);
    const res = await fetch("/api/account/language", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || t("common.tryAgain"));
      setSaving(null);
      return;
    }
    // The root layout renders the catalog, lang and dir on the server: reload to apply
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-gray-900">
          <T k="common.language" />
        </h2>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        {languages.map((l) => (
          <button
            key={l.code}
            type="button"
            id={`language-${l.code}`}
            onClick={() => choose(l.code)}
            disabled={saving !== null}
            className="w-full flex items-center justify-between p-4 text-start hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            <div>
              <p className="font-semibold text-sm text-gray-900" dir={l.direction}>
                {l.nameNative}
              </p>
              <p className="text-xs text-gray-500">
                <span>{l.nameEnglish}</span>
                {l.status !== "ACTIVE" && (
                  <span className="ms-2 px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800 rounded font-mono">
                    <T k="common.draft" />
                  </span>
                )}
              </p>
            </div>
            {current === l.code && <Check className="w-5 h-5 text-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}
