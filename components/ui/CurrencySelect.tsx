"use client";

import { useT } from "@/components/ui/T";
import { CURRENCIES } from "@/lib/currencies";

/** The currency an amount is priced in; the record keeps it, so viewers see what was quoted. */
export function CurrencySelect({ id, value, onChange }: { id: string; value: string; onChange: (code: string) => void }) {
  const t = useT();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="label !mb-0">
        {t("common.currency")}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="input">
        {CURRENCIES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </div>
  );
}
