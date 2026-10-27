export interface TranslationProvider {
  translate(text: string, sourceLang: string, targetLang: string): Promise<{ text: string; provider: string }>;
}

export class MockTranslationProvider implements TranslationProvider {
  async translate(text: string, sourceLang: string, targetLang: string) {
    // Deterministic marker per target language; placeholders like {name} and [[0]] pass through untouched
    return { text: `[${targetLang.toUpperCase()}: ${text}]`, provider: "mock" };
  }
}

/**
 * DeepL REST adapter (TRANSLATION_PROVIDER=deepl). Free-plan keys end in ":fx" and use the
 * api-free host. Bangla is not offered by every provider: unsupported targets throw, and the
 * caller falls back to showing the original text.
 */
export class DeepLTranslationProvider implements TranslationProvider {
  constructor(private apiKey: string, private fetchImpl: typeof fetch = fetch) {}

  async translate(text: string, sourceLang: string, targetLang: string) {
    const host = this.apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await this.fetchImpl(`${host}/v2/translate`, {
        method: "POST",
        headers: { Authorization: `DeepL-Auth-Key ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: [text], source_lang: sourceLang.toUpperCase(), target_lang: targetLang.toUpperCase() }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`DeepL error ${res.status}`);
      const json = (await res.json()) as { translations?: Array<{ text: string }> };
      const translated = json.translations?.[0]?.text;
      if (typeof translated !== "string") throw new Error("DeepL returned no translation");
      return { text: translated, provider: "deepl" };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function getTranslationProvider(): TranslationProvider {
  const key = process.env.TRANSLATION_API_KEY;
  if (process.env.TRANSLATION_PROVIDER === "deepl" && key) return new DeepLTranslationProvider(key);
  return new MockTranslationProvider();
}
