import { prisma } from "../prisma";

export async function listApprovedUiTranslations(langCode: string, catalog: Record<string, string> = {}): Promise<Record<string, string>> {
  try {
    const translations = await prisma.uiTranslation.findMany({
      where: {
        langCode,
        isApproved: true,
      },
      select: {
        key: true,
        text: true,
        source: true,
      },
    });

    const result: Record<string, string> = {};
    for (const t of translations) {
      // A seeded copy must not hide a later edit to the catalog file; reviewed text always wins
      if (t.source === "BUILTIN" && catalog[t.key] !== undefined) continue;
      result[t.key] = t.text;
    }
    return result;
  } catch (err) {
    // If table doesn't exist or DB offline, fallback cleanly
    console.warn(`Could not load translations from DB for ${langCode}:`, err);
    return {};
  }
}

export async function upsertUiStringAndTranslation(
  key: string,
  defaultEnglishText: string,
  translations: Record<string, string> // e.g. { bn: "...", ar: "..." }
): Promise<void> {
  await prisma.uiString.upsert({
    where: { key },
    update: { defaultText: defaultEnglishText },
    create: { key, defaultText: defaultEnglishText },
  });

  for (const [langCode, text] of Object.entries(translations)) {
    await prisma.uiTranslation.upsert({
      where: {
        key_langCode: {
          key,
          langCode,
        },
      },
      update: {
        text,
        isApproved: true,
      },
      create: {
        key,
        langCode,
        text,
        source: "BUILTIN",
        isApproved: true,
      },
    });
  }
}
