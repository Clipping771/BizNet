import * as fs from "fs";
import * as path from "path";

export interface Translations {
  [key: string]: string;
}

interface CacheEntry {
  translations: Translations;
  version: number;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry>();
let catalogVersion = 1;

/**
 * Loads translations for the specified language with fallback to English.
 */
export async function getTranslations(lang: string = "bn"): Promise<Translations> {
  const cached = memoryCache.get(lang);
  if (cached && cached.version === catalogVersion && Date.now() - cached.timestamp < 60000) {
    return cached.translations;
  }

  // Load builtin files as base
  const enFilePath = path.join(process.cwd(), "i18n", "builtin", "en.json");
  const langFilePath = path.join(process.cwd(), "i18n", "builtin", `${lang}.json`);

  let enBase: Translations = {};
  if (fs.existsSync(enFilePath)) {
    try {
      enBase = JSON.parse(fs.readFileSync(enFilePath, "utf-8"));
    } catch {
      enBase = {};
    }
  }

  let langTranslations: Translations = { ...enBase };
  if (lang !== "en" && fs.existsSync(langFilePath)) {
    try {
      const specific = JSON.parse(fs.readFileSync(langFilePath, "utf-8"));
      langTranslations = { ...langTranslations, ...specific };
    } catch {
      // fallback to en
    }
  }

  // Load database-backed approved translations and overlay on top
  try {
    const { listApprovedUiTranslations } = await import("./repo/i18n");
    const dbTranslations = await listApprovedUiTranslations(lang);
    langTranslations = { ...langTranslations, ...dbTranslations };
  } catch {
    // Graceful fallback to file-based translations if DB not available
  }

  memoryCache.set(lang, {
    translations: langTranslations,
    version: catalogVersion,
    timestamp: Date.now(),
  });

  return langTranslations;
}

/**
 * Bump catalog version to invalidate in-memory caches without redeploying.
 */
export function bumpCatalogVersion(): void {
  catalogVersion++;
  memoryCache.clear();
}

/**
 * Formats a message template with provided params.
 */
export function formatMessage(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{${key}}`;
  });
}
