export interface TranslationProvider {
  translate(text: string, sourceLang: string, targetLang: string): Promise<{ text: string; provider: string }>;
}

export class MockTranslationProvider implements TranslationProvider {
  async translate(text: string, sourceLang: string, targetLang: string) {
    if (targetLang === "en") {
      return { text: `[EN: ${text}]`, provider: "mock" };
    }
    if (targetLang === "bn") {
      return { text: `[BN: ${text}]`, provider: "mock" };
    }
    // Deterministic marker per target language; placeholders like {name} pass through untouched
    return { text: `[${targetLang.toUpperCase()}: ${text}]`, provider: "mock" };
  }
}

export function getTranslationProvider(): TranslationProvider {
  return new MockTranslationProvider();
}
