import { prisma } from "../prisma";
import { AiFeature, AiInteraction, AiOutcome } from "@prisma/client";
import * as crypto from "crypto";

export interface CreateAiInteractionInput {
  userId?: string | null;
  businessId?: string | null;
  feature: AiFeature;
  promptVersion: string;
  provider: string;
  model: string;
  input: any;
  output?: any;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  cacheHit?: boolean;
  outcome?: AiOutcome;
  editedFields?: string[];
  rating?: number;
}

export function computeInputHash(feature: string, input: any, version: string): string {
  const serialized = JSON.stringify({ feature, input, version });
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export async function createAiInteraction(
  input: CreateAiInteractionInput
): Promise<AiInteraction> {
  const inputHash = computeInputHash(input.feature, input.input, input.promptVersion);

  return prisma.aiInteraction.create({
    data: {
      userId: input.userId ?? null,
      businessId: input.businessId ?? null,
      feature: input.feature,
      promptVersion: input.promptVersion,
      provider: input.provider,
      model: input.model,
      inputHash,
      input: input.input as any,
      output: input.output ? (input.output as any) : undefined,
      inputTokens: input.inputTokens || 0,
      outputTokens: input.outputTokens || 0,
      costUsd: input.costUsd || 0,
      latencyMs: input.latencyMs || 0,
      cacheHit: input.cacheHit || false,
      outcome: input.outcome ?? null,
      editedFields: input.editedFields || [],
      rating: input.rating ?? null,
    },
  });
}

export async function updateAiOutcome(
  id: string,
  outcome: AiOutcome,
  editedFields: string[] = []
): Promise<AiInteraction> {
  return prisma.aiInteraction.update({
    where: { id },
    data: {
      outcome,
      editedFields,
    },
  });
}
