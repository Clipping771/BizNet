"use client";

import { useLang, useT } from "@/components/ui/T";
import { formatMoney, formatNumber } from "@/lib/money";

/** A number in the viewer's numeral system (Bangla digits for bn), usable from server components. */
export function Num({ n }: { n: number }) {
  const lang = useLang();
  return <>{formatNumber(n, lang)}</>;
}

/** "{n} days" with the plural form from the catalog. */
export function DaysText({ n }: { n: number }) {
  const lang = useLang();
  const t = useT();
  return <>{t(n === 1 ? "unit.day.one" : "unit.day.other", undefined, { n: formatNumber(n, lang) })}</>;
}

export function Money({ n, currency }: { n: number; currency?: string }) {
  const lang = useLang();
  return <>{formatMoney(n, lang, currency)}</>;
}

/** A catalog message whose {n} is shown in the viewer's numerals. */
export function TNum({ k, n }: { k: string; n: number }) {
  const lang = useLang();
  const t = useT();
  return <>{t(k, undefined, { n: formatNumber(n, lang) })}</>;
}

/** "৳6.80–৳7.20", or one amount when both ends are equal. */
export function MoneyRange({ min, max, currency }: { min: number; max?: number | null; currency?: string }) {
  const lang = useLang();
  const low = formatMoney(min, lang, currency);
  return <>{max != null && max !== min ? `${low}–${formatMoney(max, lang, currency)}` : low}</>;
}

/** Signed percentage change, e.g. "+2.4%". */
export function PercentChange({ value }: { value: number }) {
  const lang = useLang();
  return <>{`${value >= 0 ? "+" : "−"}${formatNumber(Math.abs(value).toFixed(1), lang)}%`}</>;
}
