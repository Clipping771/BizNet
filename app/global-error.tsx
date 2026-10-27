"use client";

import { t } from "@/components/ui/T";

/** Last-resort boundary when the root layout itself fails (no translations provider here). */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="bn">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, textAlign: "center" }}>
        <h1>{t("error.title", "bn")}</h1>
        <p>{t("error.body", "bn")}</p>
        <button type="button" onClick={reset} style={{ padding: "10px 16px", minHeight: 44 }}>
          {t("error.retry", "bn")}
        </button>
      </body>
    </html>
  );
}
