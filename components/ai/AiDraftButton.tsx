"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useLang, useT } from "@/components/ui/T";

type HelperSwitch = "aiListingWriterEnabled" | "aiQuoteAssistantEnabled" | "aiDiscussionAnswersEnabled";

/**
 * "Draft with AI" for a form field. Renders nothing until the admin turns the helper on.
 * The draft fills an editable field; nothing is submitted without the user.
 */
export function AiDraftButton({
  switchKey,
  payload,
  onDraft,
  disabled,
  id,
}: {
  switchKey: HelperSwitch;
  payload: () => Record<string, unknown>;
  onDraft: (data: any) => void;
  disabled?: boolean;
  id?: string;
}) {
  const t = useT();
  const lang = useLang();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => (r.ok ? r.json() : {}) as Promise<Record<string, boolean>>)
      .then((s) => setOn(!!s[switchKey]))
      .catch(() => {});
  }, [switchKey]);

  if (!on) return null;

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/ai/helpers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), lang }),
      });
      if (!res.ok) throw new Error();
      onDraft((await res.json()).data);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" id={id} onClick={run} disabled={busy || disabled} className="btn btn-secondary btn-sm">
        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        {busy ? t("common.loading") : t("ai.draft")}
      </button>
      {failed && <span className="text-xs text-rose-700">{t("ai.draftFailed")}</span>}
    </span>
  );
}
