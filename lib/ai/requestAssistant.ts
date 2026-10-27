/**
 * lib/ai/requestAssistant.ts
 *
 * Core service for AI Request Assistant (§8.4, F6, §12)
 */

import crypto from "crypto";
import { getAiProvider } from "@/lib/ai/provider";
import { reserveAiBudget, refundAiBudget } from "@/lib/ai/budget";
import { getSetting } from "@/lib/settings";
import {
  PROMPT_VERSION,
  RequestAssistantOutputSchema,
  buildRequestAssistantPrompt,
  type RequestAssistantOutput,
} from "@/lib/ai/prompts/requestAssistant.v1";
import { getDhakaDateString } from "@/lib/dates";
import { normalizeDigits } from "@/lib/contact/detect";
import {
  findCachedAiInteraction,
  createAiInteractionRecord,
} from "@/lib/repo/ai";
import { listActiveCategories } from "@/lib/repo/category";

export interface RequestAssistantParams {
  userId: string;
  businessId?: string;
  userText: string;
  uiLanguage?: string;
  buyerBusinessArea?: string;
}

export interface RequestAssistantResponse {
  success: boolean;
  fallback: boolean;
  data: RequestAssistantOutput | null;
  aiInteractionId?: string;
  cacheHit?: boolean;
  message?: string;
  prohibited?: boolean;
}

/**
 * Redacts phone numbers, emails, and URLs from text before sending to AI (§8.4, A8, §10).
 */
export function redactSensitiveData(rawText: string): string {
  let text = normalizeDigits(rawText);

  // Redact links and URLs
  text = text.replace(/https?:\/\/[^\s]+/gi, "[REDACTED_URL]");
  text = text.replace(/\bwww\.[^\s]+/gi, "[REDACTED_URL]");

  // Redact emails
  text = text.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[REDACTED_EMAIL]");

  // Redact BD phones and 10+ digit runs
  text = text.replace(/(?:\+?880|0)?1[3-9]\d{8}\b/g, "[REDACTED_PHONE]");
  text = text.replace(/\b\d{10,}\b/g, "[REDACTED_NUMBER]");

  return text;
}

/**
 * Checks if input contains any prohibited items from settings.
 */
export async function checkProhibitedItems(text: string): Promise<boolean> {
  const prohibitedList = await getSetting("prohibitedItems");
  if (!prohibitedList || !Array.isArray(prohibitedList)) return false;

  const lower = text.toLowerCase();
  for (const item of prohibitedList) {
    if (lower.includes(item.toLowerCase().trim())) {
      return true;
    }
  }
  return false;
}

export async function processRequestWithAi(
  params: RequestAssistantParams
): Promise<RequestAssistantResponse> {
  const uiLanguage = params.uiLanguage || "bn";

  // 1. Check prohibited items (§8.4, A8)
  const isProhibited = await checkProhibitedItems(params.userText);
  if (isProhibited) {
    return {
      success: false,
      fallback: true,
      data: null,
      prohibited: true,
      message:
        uiLanguage === "bn"
          ? "দুঃখিত, এই পণ্যটি BizNet নীতিমালায় নিয়ন্ত্রিত বা নিষিদ্ধ।"
          : "Sorry, this item is regulated or prohibited on BizNet.",
    };
  }

  // 2. Redact sensitive info (§8.4, A8)
  const redactedText = redactSensitiveData(params.userText);

  // 3. Load active categories via repo
  const categories = await listActiveCategories();

  const categorySlugs = categories.map((c) => c.slug).join(",");
  const todayDhaka = getDhakaDateString(new Date());

  // 4. Check 24-hour cache by inputHash (§8.4, A7)
  const inputHash = crypto
    .createHash("sha256")
    .update(`${redactedText}:${uiLanguage}:${categorySlugs}`)
    .digest("hex");

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cached = await findCachedAiInteraction(
    "REQUEST_ASSISTANT",
    inputHash,
    oneDayAgo
  );

  if (cached && cached.output) {
    // A cache hit still gets its own interaction row for this user (cost 0), so the
    // outcome of this buyer's request is recorded separately (§8.4, §13)
    const hit = await createAiInteractionRecord({
      userId: params.userId,
      businessId: params.businessId,
      feature: "REQUEST_ASSISTANT",
      promptVersion: cached.promptVersion,
      provider: cached.provider,
      model: cached.model,
      inputHash,
      input: { text: redactedText },
      output: cached.output,
      costUsd: 0,
      cacheHit: true,
    });
    return {
      success: true,
      fallback: false,
      data: cached.output as unknown as RequestAssistantOutput,
      aiInteractionId: hit.id,
      cacheHit: true,
    };
  }

  // 5. Reserve AI Budget (§8.4, A7, §12)
  const aiDailyRequestsPerUser = await getSetting("aiDailyRequestsPerUser");
  const aiDailyBudgetUsd = await getSetting("aiDailyBudgetUsd");

  const reservation = await reserveAiBudget({
    userId: params.userId,
    maxOutputTokens: 600,
    inputTokensUpperBound: 1200,
    globalDailyCap: aiDailyBudgetUsd,
    userDailyCap: (aiDailyBudgetUsd / 20) * (aiDailyRequestsPerUser || 20),
  });

  if (!reservation.reserved) {
    // Budget exhausted -> graceful fallback (§8.4, A6)
    const logRecord = await createAiInteractionRecord({
      userId: params.userId,
      businessId: params.businessId,
      feature: "REQUEST_ASSISTANT",
      promptVersion: PROMPT_VERSION,
      provider: "mock",
      model: "mock",
      inputHash,
      input: { text: redactedText },
      outcome: "FALLBACK",
      costUsd: 0,
    });

    return {
      success: false,
      fallback: true,
      data: null,
      aiInteractionId: logRecord.id,
      message:
        uiLanguage === "bn"
          ? "দৈনিক AI সীমা শেষ হয়েছে। অনুগ্রহ করে ফর্মটি নিজে পূরণ করুন।"
          : "Daily AI budget limit reached. Please fill the form manually.",
    };
  }

  // 6. Build Prompt and Call AI Provider with Timeout
  const prompt = buildRequestAssistantPrompt({
    userText: redactedText,
    activeCategories: categories as any,
    buyerBusinessArea: params.buyerBusinessArea,
    todayDhaka,
    uiLanguage,
  });

  const aiTimeoutMs = (await getSetting("aiTimeoutMs")) || 8000;
  const provider = getAiProvider();

  let attempt = 0;
  let parsedResult: RequestAssistantOutput | null = null;
  let actualCost = 0;
  let latencyMs = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let modelName = "unknown";
  let providerName = "mock";

  while (attempt < 2 && !parsedResult) {
    attempt++;
    const start = Date.now();
    try {
      const callPromise = provider.structured(RequestAssistantOutputSchema, prompt, {
        maxOutputTokens: 600,
        feature: "REQUEST_ASSISTANT",
        promptVersion: PROMPT_VERSION,
        userId: params.userId,
        businessId: params.businessId,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI_TIMEOUT")), aiTimeoutMs)
      );

      const res = await Promise.race([callPromise, timeoutPromise]);
      actualCost = res.costUsd;
      latencyMs = res.latencyMs;
      tokensIn = res.inputTokens;
      tokensOut = res.outputTokens;
      modelName = res.model;
      providerName = res.provider;
      parsedResult = res.data as RequestAssistantOutput;
    } catch (err: any) {
      if (attempt >= 2 || err.message === "AI_TIMEOUT") {
        break;
      }
    }
  }

  // Refund unused budget
  await refundAiBudget(reservation, actualCost, "REQUEST_ASSISTANT");

  if (!parsedResult) {
    // Log fallback
    const fallbackRecord = await createAiInteractionRecord({
      userId: params.userId,
      businessId: params.businessId,
      feature: "REQUEST_ASSISTANT",
      promptVersion: PROMPT_VERSION,
      provider: providerName,
      model: modelName,
      inputHash,
      input: { text: redactedText },
      outcome: "FALLBACK",
      costUsd: actualCost,
      latencyMs,
    });

    return {
      success: false,
      fallback: true,
      data: null,
      aiInteractionId: fallbackRecord.id,
      message:
        uiLanguage === "bn"
          ? "অনুরোধটি সাজানো সম্ভব হয়নি। অনুগ্রহ করে ফর্মটি নিজে পূরণ করুন।"
          : "Could not structure request. Please fill the form manually.",
    };
  }

  // 7. Validate attributes using buildAttributeZod (§8.4, A3)
  const matchedCat = categories.find((c) => c.slug === parsedResult?.categorySlug);
  if (matchedCat && matchedCat.attributeSchema) {
    const rawAttrs = (parsedResult.attributes || {}) as Record<string, any>;
    const cleanedAttrs: Record<string, any> = {};
    const schemaFields: any[] = (matchedCat.attributeSchema as any).fields || [];
    const validFieldKeys = new Set(schemaFields.map((f) => f.key));

    for (const [key, val] of Object.entries(rawAttrs)) {
      if (!validFieldKeys.has(key)) {
        // Unknown field dropped and added to uncertainFields
        if (!parsedResult.uncertainFields.includes(key)) {
          parsedResult.uncertainFields.push(key);
        }
      } else {
        const fieldDef = schemaFields.find((f) => f.key === key);
        let isValid = true;
        if (fieldDef?.type === "select" && fieldDef.options?.length) {
          if (!fieldDef.options.includes(val)) {
            isValid = false;
          }
        }
        if (fieldDef?.type === "number") {
          const num = Number(val);
          if (isNaN(num)) isValid = false;
          if (fieldDef.min !== undefined && num < fieldDef.min) isValid = false;
          if (fieldDef.max !== undefined && num > fieldDef.max) isValid = false;
        }

        if (isValid) {
          cleanedAttrs[key] = val;
        } else {
          // Invalid field dropped and added to uncertainFields
          if (!parsedResult.uncertainFields.includes(key)) {
            parsedResult.uncertainFields.push(key);
          }
        }
      }
    }
    parsedResult.attributes = cleanedAttrs;
  }

  // 8. Record AI Interaction in database via repo
  const interaction = await createAiInteractionRecord({
    userId: params.userId,
    businessId: params.businessId,
    feature: "REQUEST_ASSISTANT",
    promptVersion: PROMPT_VERSION,
    provider: providerName,
    model: modelName,
    inputHash,
    input: { text: redactedText },
    output: parsedResult as any,
    tokensIn,
    tokensOut,
    outcome: "ACCEPTED_AS_IS",
    costUsd: actualCost,
    latencyMs,
  });

  return {
    success: true,
    fallback: false,
    data: parsedResult,
    aiInteractionId: interaction.id,
    cacheHit: false,
  };
}
