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

export function Money({ n }: { n: number }) {
  const lang = useLang();
  return <>{formatMoney(n, lang)}</>;
}

/** A catalog message whose {n} is shown in the viewer's numerals. */
export function TNum({ k, n }: { k: string; n: number }) {
  const lang = useLang();
  const t = useT();
  return <>{t(k, undefined, { n: formatNumber(n, lang) })}</>;
}
