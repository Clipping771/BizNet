"use client";

import { createContext, useCallback, useContext } from "react";
import bnMessages from "@/i18n/builtin/bn.json";
import enMessages from "@/i18n/builtin/en.json";
import arMessages from "@/i18n/builtin/ar.json";

const messages: Record<string, Record<string, string>> = {
  en: enMessages,
  bn: bnMessages,
  ar: arMessages,
};

type Params = Record<string, string | number>;

/**
 * Catalog resolved on the server by the root layout (builtin files + approved DB
 * translations, with the ar admin-only guard applied). Components read from it so
 * approved DB translations reach the UI.
 */
const TranslationsContext = createContext<{ lang: string; messages: Record<string, string> } | null>(null);

export function TranslationsProvider({
  lang,
  messages: catalog,
  children,
}: {
  lang: string;
  messages: Record<string, string>;
  children?: React.ReactNode;
}) {
  return (
    <TranslationsContext.Provider value={{ lang, messages: catalog }}>{children}</TranslationsContext.Provider>
  );
}

function resolveCurrentLang(explicitLang?: string): string {
  if (explicitLang && messages[explicitLang]) {
    return explicitLang;
  }
  if (typeof document !== "undefined") {
    const htmlLang = document.documentElement.lang;
    if (htmlLang && messages[htmlLang]) {
      return htmlLang;
    }
  }
  return "en";
}

function format(text: string, params?: Params): string {
  if (!params) return text;
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    text
  );
}

/**
 * Builtin-only lookup for code outside a React tree. Inside components prefer
 * useT() or <T>, which include approved DB translations.
 */
export function t(key: string, lang?: string, params?: Params): string {
  const activeLang = resolveCurrentLang(lang);
  const dict = messages[activeLang] || messages["en"];
  return format(dict[key] || messages["en"]?.[key] || key, params);
}

export function useT() {
  const ctx = useContext(TranslationsContext);
  return useCallback(
    (key: string, lang?: string, params?: Params) => {
      if (ctx && (!lang || lang === ctx.lang) && ctx.messages[key]) {
        return format(ctx.messages[key], params);
      }
      return t(key, lang ?? ctx?.lang, params);
    },
    [ctx]
  );
}

/** Current UI language from the server-resolved catalog (falls back to bn). */
export function useLang(): string {
  const ctx = useContext(TranslationsContext);
  return ctx?.lang || "bn";
}

export function T({ k, lang, params }: { k: string; lang?: string; params?: Params }) {
  const translate = useT();
  return <>{translate(k, lang, params)}</>;
}
