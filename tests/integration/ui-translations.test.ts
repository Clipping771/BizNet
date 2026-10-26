import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { prisma } from "../../lib/prisma";
import { getTranslations, bumpCatalogVersion } from "../../lib/i18n";
import { T, TranslationsProvider } from "../../components/ui/T";

describe("UI renders approved DB translations", () => {
  it("<T> shows the server catalog (builtin + approved DB overlay)", async () => {
    const key = "nav.switchBusiness";
    const dbText = `DB approved ${Date.now()}`;
    await prisma.uiString.upsert({ where: { key }, update: {}, create: { key, defaultText: "Switch Business" } });
    await prisma.uiTranslation.upsert({
      where: { key_langCode: { key, langCode: "bn" } },
      update: { text: dbText, isApproved: true },
      create: { key, langCode: "bn", text: dbText, source: "HUMAN", isApproved: true },
    });

    try {
      bumpCatalogVersion();
      const catalog = await getTranslations("bn");
      const html = renderToString(
        createElement(TranslationsProvider, { lang: "bn", messages: catalog, children: createElement(T, { k: key }) })
      );
      expect(html).toContain(dbText);
    } finally {
      await prisma.uiTranslation.delete({ where: { key_langCode: { key, langCode: "bn" } } });
      bumpCatalogVersion();
    }
  });
});
