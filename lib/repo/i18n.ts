import { prisma } from "../prisma";

export async function listApprovedUiTranslations(langCode: string): Promise<Record<string, string>> {
  try {
    const translations = await prisma.uiTranslation.findMany({
      where: {
        langCode,
        isApproved: true,
      },
      select: {
        key: true,
        text: true,
      },
    });

    const result: Record<string, string> = {};
    for (const t of translations) {
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
