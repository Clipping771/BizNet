"use client";

import { useEffect, useState } from "react";
import { Translate } from "@phosphor-icons/react";
import { useLang, useT } from "@/components/ui/T";

interface LanguageOption {
  code: string;
  nameNative: string;
}

const FALLBACK: LanguageOption[] = [
  { code: "en", nameNative: "English" },
  { code: "bn", nameNative: "বাংলা" },
];

/**
 * Compact language picker that works signed in or out: it posts to /api/account/language, which sets
 * the `biznet_lang` cookie (and saves it on the user when signed in), then reloads so the server
 * layout renders the new catalog and text direction.
 */
export function LanguageSwitcher({ inverted = false, className = "" }: { inverted?: boolean; className?: string }) {
  const t = useT();
  const current = useLang();
  const [options, setOptions] = useState<LanguageOption[]>(FALLBACK);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/languages")
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d.languages) && d.languages.length) setOptions(d.languages);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const choose = async (code: string) => {
    if (code === current) return;
    setSaving(true);
    try {
      const res = await fetch("/api/account/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
    } catch {
      // fall through and re-enable the picker
    }
    setSaving(false);
  };

  const tone = inverted
    ? "border-white/20 bg-white/5 text-white hover:bg-white/10 [&>option]:text-slate-900"
    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300";

  return (
    <label className={`relative inline-flex shrink-0 items-center ${className}`}>
      <span className="sr-only">{t("common.language")}</span>
      <Translate
        aria-hidden="true"
        className={`pointer-events-none absolute start-2.5 h-4 w-4 ${inverted ? "text-primary-100" : "text-slate-500"}`}
      />
      <select
        value={current}
        disabled={saving}
        onChange={(e) => choose(e.target.value)}
        className={`h-9 cursor-pointer appearance-none rounded-lg border ps-8 pe-3 text-[13px] font-medium transition-colors disabled:opacity-60 ${tone}`}
      >
        {options.some((o) => o.code === current) ? null : <option value={current}>{current}</option>}
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.nameNative}
          </option>
        ))}
      </select>
    </label>
  );
}
