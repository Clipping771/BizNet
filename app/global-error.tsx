"use client";

import { t } from "@/components/ui/T";

/** Last-resort boundary when the root layout itself fails (no translations provider here). */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, textAlign: "center" }}>
        <h1>{t("error.title", "en")}</h1>
        <p>{t("error.body", "en")}</p>
        <button type="button" onClick={reset} style={{ padding: "10px 16px", minHeight: 44 }}>
          {t("error.retry", "en")}
        </button>
      </body>
    </html>
  );
}
