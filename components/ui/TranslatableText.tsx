"use client";

import { useEffect, useState } from "react";
import { T, useLang, useT } from "@/components/ui/T";

let flagsPromise: Promise<{ translationEnabled: boolean; leadCreditsEnabled: boolean }> | null = null;

/** Public feature switches, fetched once per page load. */
export function useFeatureFlags() {
  const [flags, setFlags] = useState({ translationEnabled: false, leadCreditsEnabled: false });
  useEffect(() => {
    flagsPromise ??= fetch("/api/settings/public")
      .then((r) => (r.ok ? r.json() : { translationEnabled: false, leadCreditsEnabled: false }))
      .catch(() => ({ translationEnabled: false, leadCreditsEnabled: false }));
    flagsPromise.then(setFlags);
  }, []);
  return flags;
}

/**
 * User-written text with on-demand translation (F22). Shows a "Translate" link only when
 * translation is switched on and the text's language differs from the UI language; after
 * translating, "Translated · Show original" toggles back. Numbers are restored exactly by the server.
 */
export function TranslatableText({
  entityType,
  entityId,
  field,
  text,
  sourceLang,
  className,
}: {
  entityType: string;
  entityId: string;
  field: string;
  text: string;
  sourceLang?: string | null;
  className?: string;
}) {
  const t = useT();
  const lang = useLang();
  const { translationEnabled } = useFeatureFlags();
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const canTranslate = translationEnabled && !!text.trim() && (sourceLang ?? lang) !== lang;

  const translate = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, field, targetLang: lang }),
      });
      const json = await res.json();
      if (res.ok && json.translated) {
        setTranslated(json.text);
        setShowOriginal(false);
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const shown = translated && !showOriginal ? translated : text;
  return (
    <span className="block">
      <span className={className} data-translated={translated && !showOriginal ? "true" : "false"}>
        {shown}
      </span>
      {canTranslate && (
        <span className="block text-[10px] text-gray-400 mt-0.5">
          {translated ? (
            <>
              {!showOriginal && (
                <span>
                  <T k="translate.translated" />
                  {" · "}
                </span>
              )}
              <button type="button" onClick={() => setShowOriginal((v) => !v)} className="underline">
                {showOriginal ? t("translate.showTranslation") : t("translate.showOriginal")}
              </button>
            </>
          ) : (
            <button type="button" onClick={translate} disabled={busy} className="underline" data-translate-button={entityId}>
              {busy ? t("common.loading") : t("translate.action")}
            </button>
          )}
          {failed && (
            <span className="ms-1">
              <T k="translate.failed" />
            </span>
          )}
        </span>
      )}
    </span>
  );
}
