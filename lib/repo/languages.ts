/**
 * lib/repo/languages.ts
 *
 * Admin language management (§11): add a language, auto-draft its UI translations through the
 * TranslationProvider (mock in tests), approve / edit keys with placeholder checks, import/export
 * JSON, and status changes — ACTIVE only with ≥ 90% of critical keys approved. Every change bumps
 * the in-memory catalog version so no redeploy is needed.
 */

import { LanguageStatus, TranslationSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { bumpCatalogVersion } from "@/lib/i18n";
import { getTranslationProvider } from "@/lib/translation/provider";
import { ACTIVATION_CRITICAL_SHARE, placeholdersOf } from "@/lib/i18n-critical";

export class LanguageError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "LanguageError";
  }
}

async function ensureDefaultLanguages() {
  try {
    const count = await prisma.language.count();
    if (count === 0) {
      await prisma.language.createMany({
        data: [
          {
            code: "bn",
            nameNative: "বাংলা",
            nameEnglish: "Bengali",
            direction: "ltr",
            fontFamily: "Noto Sans Bengali",
            status: LanguageStatus.ACTIVE,
          },
          {
            code: "en",
            nameNative: "English",
            nameEnglish: "English",
            direction: "ltr",
            status: LanguageStatus.ACTIVE,
          },
        ],
        skipDuplicates: true,
      });
    }
  } catch {
    // Gracefully handle if DB is offline or migrating
  }
}

export async function getLanguage(code: string) {
  if (!code) return null;
  let lang = await prisma.language.findUnique({ where: { code } });
  if (!lang && (code === "bn" || code === "en")) {
    await ensureDefaultLanguages();
    lang = await prisma.language.findUnique({ where: { code } });
  }
  return lang;
}

export async function listLanguagesWithProgress() {
  await ensureDefaultLanguages();
  const [languages, totalKeys, criticalKeys] = await Promise.all([
    prisma.language.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.uiString.count(),
    prisma.uiString.count({ where: { isCritical: true } }),
  ]);
  const rows = [];
  for (const lang of languages) {
    const [approved, criticalApproved, drafts] = await Promise.all([
      prisma.uiTranslation.count({ where: { langCode: lang.code, isApproved: true } }),
      prisma.uiTranslation.count({ where: { langCode: lang.code, isApproved: true, uiString: { isCritical: true } } }),
      prisma.uiTranslation.count({ where: { langCode: lang.code, isApproved: false } }),
    ]);
    rows.push({
      ...lang,
      totalKeys,
      approved: lang.code === "en" ? totalKeys : approved,
      drafts,
      criticalKeys,
      criticalApproved: lang.code === "en" ? criticalKeys : criticalApproved,
    });
  }
  return rows;
}

const CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export async function addLanguage(input: {
  adminUserId: string;
  code: string;
  nameNative: string;
  nameEnglish: string;
  direction: string;
  fontFamily?: string | null;
  fallbackCode?: string | null;
}) {
  const code = input.code.trim();
  if (!CODE.test(code)) throw new LanguageError("Language code must look like 'hi' or 'zh-Hans'");
  if (!input.nameNative?.trim() || !input.nameEnglish?.trim()) throw new LanguageError("Both names are required");
  if (input.direction !== "ltr" && input.direction !== "rtl") throw new LanguageError("Direction must be ltr or rtl");
  if (await getLanguage(code)) throw new LanguageError("Language already exists", 409);
  const fallbackCode = input.fallbackCode || "en";
  if (!(await getLanguage(fallbackCode))) throw new LanguageError("Fallback language not found");

  const lang = await prisma.language.create({
    data: {
      code,
      nameNative: input.nameNative.trim(),
      nameEnglish: input.nameEnglish.trim(),
      direction: input.direction,
      fontFamily: input.fontFamily?.trim() || null,
      fallbackCode,
      status: LanguageStatus.DRAFT,
    },
  });
  await logAudit({ actorUserId: input.adminUserId, action: "LANGUAGE_ADDED", entityType: "LANGUAGE", entityId: code, after: { ...lang } });
  return lang;
}

/**
 * Machine-drafts every key that has no translation yet (never overwrites human or builtin
 * text). Drafts are unapproved until an admin approves them.
 */
export async function autoDraftLanguage(input: { adminUserId: string; code: string }) {
  const lang = await getLanguage(input.code);
  if (!lang) throw new LanguageError("Language not found", 404);
  if (lang.code === "en") throw new LanguageError("English is the source language");

  const [strings, existing] = await Promise.all([
    prisma.uiString.findMany({ select: { key: true, defaultText: true } }),
    prisma.uiTranslation.findMany({ where: { langCode: lang.code }, select: { key: true } }),
  ]);
  const have = new Set(existing.map((e) => e.key));
  const provider = getTranslationProvider();
  let drafted = 0;
  for (const s of strings) {
    if (have.has(s.key)) continue;
    const { text } = await provider.translate(s.defaultText, "en", lang.code);
    // Keep placeholders intact even if a provider mangles them
    const safe = placeholdersOf(text).join() === placeholdersOf(s.defaultText).join() ? text : s.defaultText;
    await prisma.uiTranslation.create({
      data: { key: s.key, langCode: lang.code, text: safe, source: TranslationSource.MACHINE, isApproved: false },
    });
    drafted++;
  }
  await logAudit({ actorUserId: input.adminUserId, action: "LANGUAGE_AUTO_DRAFT", entityType: "LANGUAGE", entityId: lang.code, after: { drafted } });
  return { drafted };
}

export async function listTranslations(code: string, filter: "all" | "unapproved" | "critical", offset = 0) {
  const where: Record<string, unknown> = { langCode: code };
  if (filter === "unapproved") where.isApproved = false;
  if (filter === "critical") where.uiString = { isCritical: true };
  return prisma.uiTranslation.findMany({
    where,
    include: { uiString: { select: { defaultText: true, isCritical: true } } },
    orderBy: { key: "asc" },
    take: 50,
    skip: offset,
  });
}

/** Edit (and approve) one key; the text must keep exactly the English placeholders. */
export async function saveTranslation(input: { adminUserId: string; code: string; key: string; text: string; approve: boolean }) {
  const source = await prisma.uiString.findUnique({ where: { key: input.key } });
  if (!source) throw new LanguageError("Unknown key", 404);
  if (!(await getLanguage(input.code))) throw new LanguageError("Language not found", 404);
  const text = input.text?.trim();
  if (!text) throw new LanguageError("Text is required");
  if (placeholdersOf(text).join() !== placeholdersOf(source.defaultText).join()) {
    throw new LanguageError(`Placeholders must match: ${placeholdersOf(source.defaultText).map((p) => `{${p}}`).join(" ") || "none"}`);
  }
  const row = await prisma.uiTranslation.upsert({
    where: { key_langCode: { key: input.key, langCode: input.code } },
    update: { text, isApproved: input.approve, reviewerUserId: input.adminUserId, source: TranslationSource.HUMAN, version: { increment: 1 } },
    create: { key: input.key, langCode: input.code, text, isApproved: input.approve, reviewerUserId: input.adminUserId, source: TranslationSource.HUMAN },
  });
  bumpCatalogVersion();
  return row;
}

/** Approve the given keys, or every critical key when `criticalOnly`. */
export async function approveTranslations(input: { adminUserId: string; code: string; keys?: string[]; criticalOnly?: boolean }) {
  if (!(await getLanguage(input.code))) throw new LanguageError("Language not found", 404);
  const where: Record<string, unknown> = { langCode: input.code, isApproved: false };
  if (input.criticalOnly) where.uiString = { isCritical: true };
  else if (input.keys?.length) where.key = { in: input.keys };
  else throw new LanguageError("Choose keys to approve");
  const result = await prisma.uiTranslation.updateMany({ where, data: { isApproved: true, reviewerUserId: input.adminUserId } });
  await logAudit({ actorUserId: input.adminUserId, action: "LANGUAGE_KEYS_APPROVED", entityType: "LANGUAGE", entityId: input.code, after: { count: result.count, criticalOnly: !!input.criticalOnly } });
  bumpCatalogVersion();
  return { approved: result.count };
}

export async function criticalApprovalShare(code: string): Promise<number> {
  if (code === "en") return 1;
  const [critical, approved] = await Promise.all([
    prisma.uiString.count({ where: { isCritical: true } }),
    prisma.uiTranslation.count({ where: { langCode: code, isApproved: true, uiString: { isCritical: true } } }),
  ]);
  return critical === 0 ? 1 : approved / critical;
}

export async function setLanguageStatus(input: { adminUserId: string; code: string; status: LanguageStatus }) {
  const lang = await getLanguage(input.code);
  if (!lang) throw new LanguageError("Language not found", 404);
  if (!Object.values(LanguageStatus).includes(input.status)) throw new LanguageError("Invalid status");
  if (input.code === "en" && input.status !== LanguageStatus.ACTIVE) throw new LanguageError("English must stay active");
  if (input.status === LanguageStatus.ACTIVE) {
    const share = await criticalApprovalShare(input.code);
    if (share < ACTIVATION_CRITICAL_SHARE) {
      throw new LanguageError(`Only ${Math.floor(share * 100)}% of critical keys are approved (90% needed)`);
    }
  }
  const updated = await prisma.language.update({ where: { code: input.code }, data: { status: input.status } });
  await logAudit({
    actorUserId: input.adminUserId,
    action: "LANGUAGE_STATUS_CHANGED",
    entityType: "LANGUAGE",
    entityId: input.code,
    before: { status: lang.status },
    after: { status: updated.status },
  });
  bumpCatalogVersion();
  return updated;
}

export async function exportLanguage(code: string) {
  const rows = await prisma.uiTranslation.findMany({ where: { langCode: code, isApproved: true }, select: { key: true, text: true }, orderBy: { key: "asc" } });
  return Object.fromEntries(rows.map((r) => [r.key, r.text]));
}

/** Imports `{ key: text }` as unapproved HUMAN drafts; keys with placeholder mismatches are skipped. */
export async function importLanguage(input: { adminUserId: string; code: string; data: Record<string, unknown> }) {
  if (!(await getLanguage(input.code))) throw new LanguageError("Language not found", 404);
  const strings = await prisma.uiString.findMany({ select: { key: true, defaultText: true } });
  const defaults = new Map(strings.map((s) => [s.key, s.defaultText]));
  let imported = 0;
  const skipped: string[] = [];
  for (const [key, value] of Object.entries(input.data)) {
    const def = defaults.get(key);
    if (typeof value !== "string" || !def || !value.trim() || placeholdersOf(value).join() !== placeholdersOf(def).join()) {
      skipped.push(key);
      continue;
    }
    await prisma.uiTranslation.upsert({
      where: { key_langCode: { key, langCode: input.code } },
      update: { text: value.trim(), isApproved: false, source: TranslationSource.HUMAN },
      create: { key, langCode: input.code, text: value.trim(), isApproved: false, source: TranslationSource.HUMAN },
    });
    imported++;
  }
  await logAudit({ actorUserId: input.adminUserId, action: "LANGUAGE_IMPORTED", entityType: "LANGUAGE", entityId: input.code, after: { imported, skipped: skipped.length } });
  return { imported, skipped };
}

export async function listActiveLanguages() {
  return prisma.language.findMany({ where: { status: LanguageStatus.ACTIVE }, orderBy: { createdAt: "asc" } });
}

/** Languages a user can pick: ACTIVE; admins also DRAFT and BETA (preview). */
export async function listSelectableLanguages(isAdmin: boolean) {
  return prisma.language.findMany({
    where: { status: { in: isAdmin ? [LanguageStatus.ACTIVE, LanguageStatus.BETA, LanguageStatus.DRAFT] : [LanguageStatus.ACTIVE] } },
    select: { code: true, nameNative: true, nameEnglish: true, status: true, direction: true },
    orderBy: { createdAt: "asc" },
  });
}
