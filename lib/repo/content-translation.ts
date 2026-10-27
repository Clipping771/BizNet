/**
 * lib/repo/content-translation.ts
 *
 * On-demand translation of user content (F22, READY — off until `translationEnabled`).
 * The server loads the text itself, so a user can only translate content they may read.
 * Results are cached in ContentTranslation by (entity, field, target language, source hash).
 * Numbers/units/money are masked and restored exactly; the original stays the commercial record
 * (order confirmation always shows original terms).
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { logEvent } from "@/lib/events";
import { checkRateLimit } from "@/lib/ratelimit";
import { executeAtomicBudgetReservation } from "@/lib/repo/budget";
import { getTranslationProvider } from "@/lib/translation/provider";
import { protectNumbers, restoreNumbers } from "@/lib/translation/protect";
import { getRequestForViewer } from "@/lib/repo/request";

export class TranslationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "TranslationError";
  }
}

export const TRANSLATABLE: Record<string, string[]> = {
  MESSAGE: ["body"],
  QUESTION: ["title", "body"],
  ANSWER: ["body"],
  QUOTE: ["notes"],
  REQUEST: ["title", "description", "budgetNote"],
};

/** Upper-bound provider price per character (DeepL-like), used for the daily budget. */
const PRICE_PER_CHAR_USD = 0.000025;
const MAX_CHARS = 5000;

interface Viewer {
  userId: string;
  businessId: string | null;
  isAdmin: boolean;
}

const PUBLIC_QUESTION = ["OPEN", "ANSWERED", "SOLVED"];

/** Loads the field's text and source language if the viewer may read it; null otherwise. */
async function readableText(entityType: string, entityId: string, field: string, viewer: Viewer): Promise<{ text: string; lang: string } | null> {
  if (!entityId) return null;
  switch (entityType) {
    case "MESSAGE": {
      const m = await prisma.message.findUnique({ where: { id: entityId }, include: { conversation: { select: { buyerBusinessId: true, supplierBusinessId: true } } } });
      if (!m) return null;
      const party = viewer.businessId === m.conversation.buyerBusinessId || viewer.businessId === m.conversation.supplierBusinessId;
      return party || viewer.isAdmin ? { text: m.body, lang: m.lang } : null;
    }
    case "QUESTION": {
      const q = await prisma.question.findFirst({ where: { id: entityId, deletedAt: null } });
      if (!q || (!PUBLIC_QUESTION.includes(q.status) && !viewer.isAdmin && q.authorUserId !== viewer.userId)) return null;
      return { text: field === "title" ? q.title : q.body, lang: q.lang };
    }
    case "ANSWER": {
      const a = await prisma.answer.findFirst({ where: { id: entityId, deletedAt: null }, include: { question: { select: { status: true } } } });
      if (!a || !PUBLIC_QUESTION.includes(a.question.status)) return null;
      return { text: a.body, lang: a.lang };
    }
    case "QUOTE": {
      const q = await prisma.quote.findUnique({ where: { id: entityId }, include: { request: { select: { buyerBusinessId: true } } } });
      if (!q) return null;
      const party = viewer.businessId === q.supplierBusinessId || viewer.businessId === q.request.buyerBusinessId;
      return party || viewer.isAdmin ? { text: q.notes ?? "", lang: q.lang } : null;
    }
    case "REQUEST": {
      const r = await getRequestForViewer(entityId, { businessId: viewer.businessId, isAdmin: viewer.isAdmin });
      if (!r) return null;
      const value = field === "title" ? r.title : field === "description" ? r.description : r.budgetNote;
      return { text: value ?? "", lang: r.lang };
    }
    default:
      return null;
  }
}

export interface TranslationResult {
  text: string;
  sourceLang: string;
  targetLang: string;
  provider: string;
  cached: boolean;
  translated: boolean;
}

export async function translateContent(input: { viewer: Viewer; entityType: string; entityId: string; field: string; targetLang: string }): Promise<TranslationResult> {
  if (!(await getSetting("translationEnabled"))) throw new TranslationError("Translation is not active", 403);
  if (!TRANSLATABLE[input.entityType]?.includes(input.field)) throw new TranslationError("This field cannot be translated");
  const target = await prisma.language.findUnique({ where: { code: input.targetLang } });
  if (!target || target.status === "DISABLED") throw new TranslationError("Unknown target language");

  const source = await readableText(input.entityType, input.entityId, input.field, input.viewer);
  if (!source) throw new TranslationError("Not found", 404);
  const text = source.text.slice(0, MAX_CHARS);
  if (!text.trim() || source.lang === input.targetLang) {
    return { text: source.text, sourceLang: source.lang, targetLang: input.targetLang, provider: "none", cached: false, translated: false };
  }

  const sourceHash = crypto.createHash("sha256").update(text).digest("hex");
  const key = { entityType: input.entityType, entityId: input.entityId, field: input.field, targetLang: input.targetLang, sourceHash };
  const cached = await prisma.contentTranslation.findUnique({ where: { entityType_entityId_field_targetLang_sourceHash: key } });
  if (cached) {
    return { text: cached.text, sourceLang: source.lang, targetLang: input.targetLang, provider: cached.provider, cached: true, translated: true };
  }

  // Per-user daily limit and a hard global daily budget (reserve the full cost up front)
  const limit = await checkRateLimit(`translate:${input.viewer.userId}`, 200, 86400);
  if (!limit.success) throw new TranslationError("Daily translation limit reached", 429);
  const cap = await getSetting("translationDailyBudgetUsd");
  const cost = Number((text.length * PRICE_PER_CHAR_USD).toFixed(6));
  const today = new Date().toISOString().slice(0, 10);
  if (!(await executeAtomicBudgetReservation("translation:global", today, cost, cap))) {
    throw new TranslationError("Translation budget for today is used up", 429);
  }

  const { masked, tokens } = protectNumbers(text);
  let translatedText: string | null = null;
  let provider = "none";
  try {
    const res = await getTranslationProvider().translate(masked, source.lang, input.targetLang);
    provider = res.provider;
    translatedText = restoreNumbers(res.text, tokens);
  } catch (err) {
    console.error("Translation provider error:", err);
  }
  if (translatedText === null) {
    // Provider failed or touched a number: never show a translation we cannot trust
    return { text: source.text, sourceLang: source.lang, targetLang: input.targetLang, provider, cached: false, translated: false };
  }

  await prisma.contentTranslation.upsert({
    where: { entityType_entityId_field_targetLang_sourceHash: key },
    update: { text: translatedText, provider },
    create: { ...key, sourceLang: source.lang, text: translatedText, provider },
  });
  await logEvent({ name: "content_translated", userId: input.viewer.userId, props: { entityType: input.entityType, field: input.field, targetLang: input.targetLang, chars: text.length } });
  return { text: translatedText, sourceLang: source.lang, targetLang: input.targetLang, provider, cached: false, translated: true };
}
