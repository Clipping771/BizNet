import * as fs from "fs";
import * as path from "path";
import { PrismaClient, TranslationSource } from "@prisma/client";

const prisma = new PrismaClient();

async function extractAndSeedI18n() {
  console.log("Extracting and syncing i18n message catalog to database...");

  const enPath = path.join(process.cwd(), "i18n", "builtin", "en.json");
  const bnPath = path.join(process.cwd(), "i18n", "builtin", "bn.json");

  const enData: Record<string, string> = JSON.parse(fs.readFileSync(enPath, "utf-8"));
  const bnData: Record<string, string> = JSON.parse(fs.readFileSync(bnPath, "utf-8"));

  // Ensure Languages exist
  await prisma.language.upsert({
    where: { code: "en" },
    update: { status: "ACTIVE" },
    create: {
      code: "en",
      nameNative: "English",
      nameEnglish: "English",
      direction: "ltr",
      status: "ACTIVE",
    },
  });

  await prisma.language.upsert({
    where: { code: "bn" },
    update: { status: "ACTIVE" },
    create: {
      code: "bn",
      nameNative: "বাংলা",
      nameEnglish: "Bengali",
      direction: "ltr",
      fontFamily: "Noto Sans Bengali",
      status: "ACTIVE",
    },
  });

  await prisma.language.upsert({
    where: { code: "ar" },
    update: { status: "DRAFT" },
    create: {
      code: "ar",
      nameNative: "العربية",
      nameEnglish: "Arabic",
      direction: "rtl",
      status: "DRAFT", // Architecture test only
    },
  });

  for (const [key, defaultText] of Object.entries(enData)) {
    // Extract placeholders like {name}
    const placeholders = Array.from(defaultText.matchAll(/\{(\w+)\}/g)).map(m => m[1]);

    await prisma.uiString.upsert({
      where: { key },
      update: { defaultText, placeholders },
      create: {
        key,
        defaultText,
        isCritical: true,
        placeholders,
      },
    });

    // Upsert English translation
    await prisma.uiTranslation.upsert({
      where: { key_langCode: { key, langCode: "en" } },
      update: { text: defaultText, isApproved: true },
      create: {
        key,
        langCode: "en",
        text: defaultText,
        source: TranslationSource.BUILTIN,
        isApproved: true,
      },
    });

    // Upsert Bengali translation if present
    if (bnData[key]) {
      await prisma.uiTranslation.upsert({
        where: { key_langCode: { key, langCode: "bn" } },
        update: { text: bnData[key], isApproved: true },
        create: {
          key,
          langCode: "bn",
          text: bnData[key],
          source: TranslationSource.BUILTIN,
          isApproved: true,
        },
      });
    }
  }

  console.log(`✅ Synced ${Object.keys(enData).length} UI strings and translations to database.`);
}

extractAndSeedI18n()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
