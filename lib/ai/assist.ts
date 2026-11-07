/**
 * lib/ai/assist.ts
 *
 * Shared path for the optional AI helpers (F24): each has its own admin switch, is off by default,
 * spends from the daily budget, logs an AiInteraction, and returns text a person reviews before use.
 * Prices, quantities and other numbers are never AI's to invent: a draft may only repeat numbers
 * already in its input. Drafts carrying contact details are thrown away.
 */

import crypto from "crypto";
import type { z } from "zod";
import type { AiFeature } from "@prisma/client";
import { getAiProvider } from "@/lib/ai/provider";
import { reserveAiBudget, refundAiBudget } from "@/lib/ai/budget";
import { AI_INPUT_TOKENS_UPPER_BOUND, AI_MAX_OUTPUT_TOKENS } from "@/lib/ai/pricing";
import { detectContactBypass, normalizeDigits } from "@/lib/contact/detect";
import { createAiInteractionRecord, findCachedAiInteraction } from "@/lib/repo/ai";
import { getSetting, type PlatformSettings } from "@/lib/settings";

export type AiSwitch = {
  [K in keyof PlatformSettings]: PlatformSettings[K] extends boolean ? (K extends `ai${string}Enabled` ? K : never) : never;
}[keyof PlatformSettings];

export type AssistResult<T> = { ok: true; data: T; aiInteractionId: string } | { ok: false; reason: "DISABLED" | "BUDGET" | "FAILED" };

export function isAiHelperOn(key: AiSwitch): Promise<boolean> {
  return Promise.all([getSetting("aiEnabled"), getSetting(key)]).then(([all, one]) => !!all && !!one);
}

/** Every digit run in the output must already appear in the input (Latin and Bangla digits compare equal). */
export function numbersComeFromInput(output: string, input: string): boolean {
  const digits = (s: string) => normalizeDigits(s).match(/\d+(?:[.,]\d+)*/g) ?? [];
  const allowed = new Set(digits(input));
  return digits(output).every((n) => allowed.has(n));
}

function checkText(values: string[], input: string, allowNumbers: boolean): boolean {
  return values.every(
    (v) => (allowNumbers ? numbersComeFromInput(v, input) : !/\d/.test(normalizeDigits(v))) && !detectContactBypass(v).hasContact
  );
}

export interface AssistParams<T> {
  feature: AiFeature;
  switchKey: AiSwitch;
  promptVersion: string;
  userId?: string;
  businessId?: string | null;
  /** The facts given to the model; part of the cache key and the numbers check. */
  input: string;
  prompt: string;
  schema: z.ZodSchema<T>;
  /** What the mock provider answers (tests, local development). */
  mockData: T;
  /** Text fields to check in the answer. */
  texts: (data: T) => string[];
  /** False: the answer may hold no digits at all. */
  allowInputNumbers?: boolean;
  /** Hours to reuse an identical answer. */
  cacheHours?: number;
}

export async function runAiAssist<T>(p: AssistParams<T>): Promise<AssistResult<T>> {
  if (!(await isAiHelperOn(p.switchKey))) return { ok: false, reason: "DISABLED" };

  const inputHash = crypto.createHash("sha256").update(`${p.promptVersion}:${p.input}`).digest("hex");
  const base = { userId: p.userId, businessId: p.businessId ?? undefined, feature: p.feature, promptVersion: p.promptVersion, inputHash, input: { text: p.input } };

  if (p.cacheHours) {
    const cached = await findCachedAiInteraction(p.feature, inputHash, new Date(Date.now() - p.cacheHours * 3600000));
    if (cached?.output) {
      const hit = await createAiInteractionRecord({ ...base, provider: cached.provider, model: cached.model, output: cached.output, costUsd: 0, cacheHit: true });
      return { ok: true, data: cached.output as unknown as T, aiInteractionId: hit.id };
    }
  }

  const [dailyBudget, perUser] = await Promise.all([getSetting("aiDailyBudgetUsd"), getSetting("aiDailyRequestsPerUser")]);
  const reservation = await reserveAiBudget({
    userId: p.userId,
    maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
    inputTokensUpperBound: AI_INPUT_TOKENS_UPPER_BOUND,
    globalDailyCap: dailyBudget,
    userDailyCap: (dailyBudget / 20) * (perUser || 20),
  });
  if (!reservation.reserved) {
    await createAiInteractionRecord({ ...base, provider: "none", model: "none", outcome: "FALLBACK", costUsd: 0 });
    return { ok: false, reason: "BUDGET" };
  }

  let spent = 0;
  try {
    const timeoutMs = (await getSetting("aiTimeoutMs")) || 20000;
    const call = getAiProvider().structured(p.schema, p.prompt, {
      maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
      feature: p.feature,
      promptVersion: p.promptVersion,
      userId: p.userId,
      businessId: p.businessId ?? undefined,
      mockData: p.mockData,
    });
    const res = await Promise.race([call, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), timeoutMs))]);
    spent = res.costUsd;

    const valid = checkText(p.texts(res.data), p.input, p.allowInputNumbers !== false);
    const record = await createAiInteractionRecord({
      ...base,
      provider: res.provider,
      model: res.model,
      output: valid ? (res.data as any) : undefined,
      outcome: valid ? undefined : "ERROR",
      costUsd: res.costUsd,
      tokensIn: res.inputTokens,
      tokensOut: res.outputTokens,
      latencyMs: res.latencyMs,
    });
    return valid ? { ok: true, data: res.data, aiInteractionId: record.id } : { ok: false, reason: "FAILED" };
  } catch (err) {
    console.error(`AI ${p.feature} failed:`, err);
    await createAiInteractionRecord({ ...base, provider: "unknown", model: "unknown", outcome: "ERROR", costUsd: 0 }).catch(() => {});
    return { ok: false, reason: "FAILED" };
  } finally {
    await refundAiBudget(reservation, spent).catch(() => {});
  }
}

/** Marks user text as data, so instructions inside it are not followed. */
export function userText(text: string): string {
  return `<user_text>\n${text.replace(/<\/?user_text>/g, "")}\n</user_text>`;
}

export const LANGUAGE_NAME: Record<string, string> = { bn: "Bangla", en: "English", ar: "Arabic" };
