/**
 * lib/repo/ai.ts
 *
 * Repository for AI Interactions, Feedback, and Caching (§8.4, §12)
 */

import { prisma } from "@/lib/prisma";
import { AiFeature, AiOutcome, Prisma } from "@prisma/client";

export interface CreateAiInteractionInput {
  userId: string;
  businessId?: string;
  feature: AiFeature;
  promptVersion: string;
  provider: string;
  model: string;
  inputHash: string;
  input: any;
  output?: any;
  outcome?: AiOutcome | null;
  costUsd: number;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
  cacheHit?: boolean;
}

export async function findCachedAiInteraction(feature: AiFeature, inputHash: string, sinceDate: Date) {
  return prisma.aiInteraction.findFirst({
    where: {
      feature,
      inputHash,
      createdAt: { gte: sinceDate },
      output: { not: Prisma.JsonNull },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createAiInteractionRecord(input: CreateAiInteractionInput) {
  return prisma.aiInteraction.create({
    data: {
      userId: input.userId,
      businessId: input.businessId,
      feature: input.feature,
      promptVersion: input.promptVersion,
      provider: input.provider,
      model: input.model,
      inputHash: input.inputHash,
      input: input.input,
      output: input.output,
      outcome: input.outcome,
      costUsd: input.costUsd,
      inputTokens: input.tokensIn || 0,
      outputTokens: input.tokensOut || 0,
      latencyMs: input.latencyMs || 0,
      cacheHit: input.cacheHit || false,
    },
  });
}

/** Rates an AI interaction; only the user it belongs to may rate it. Returns false otherwise. */
export async function rateAiInteractionRecord(id: string, userId: string, rating: number) {
  const result = await prisma.aiInteraction.updateMany({
    where: { id, userId },
    data: {
      rating: rating > 0 ? 1 : -1,
    },
  });
  return result.count === 1;
}
