import { z } from "zod";

export interface AiOptions {
  maxOutputTokens: number;
  inputTokensUpperBound?: number;
  userId?: string;
  businessId?: string;
  feature?: "REQUEST_ASSISTANT" | "QUOTE_COMPARISON" | "TRANSLATION" | "TRANSCRIPTION";
  promptVersion?: string;
}

export interface AiResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  model: string;
  provider: string;
  cacheHit?: boolean;
}

export interface AiProvider {
  structured<T>(
    schema: z.ZodSchema<T>,
    prompt: string,
    options: AiOptions
  ): Promise<AiResult<T>>;
  complete(prompt: string, options: AiOptions): Promise<AiResult<string>>;
  transcribe(
    audioBuffer: Buffer,
    mimeType: string,
    options?: { timeoutMs?: number }
  ): Promise<{ text: string }>;
}

export class MockAiProvider implements AiProvider {
  private simulateOverrun: boolean = false;

  constructor(options?: { simulateOverrun?: boolean }) {
    if (options?.simulateOverrun) {
      this.simulateOverrun = true;
    }
  }

  async structured<T>(
    schema: z.ZodSchema<T>,
    prompt: string,
    options: AiOptions
  ): Promise<AiResult<T>> {
    const start = Date.now();
    let data: any = {};

    // Standard mock fixture for Request Assistant
    if (prompt.includes("কন্টেইনার") || prompt.includes("container")) {
      data = {
        categorySlug: "containers",
        title: "৭৫০ মিলি ঢাকনাওয়ালা কন্টেইনার",
        attributes: {
          capacity_ml: 750,
          has_lid: true,
        },
        quantity: 500,
        unit: "pcs",
        neededBy: new Date(Date.now() + 86400000).toISOString().split("T")[0],
        deliveryArea: "Mirpur",
        preferredPaymentTerm: "CASH_ON_DELIVERY",
        priority: "BALANCED",
        uncertainFields: ["material"],
        questions: [
          {
            field: "material",
            question: "কন্টেইনারের উপাদান কি হবে?",
            options: ["plastic_pp", "paper", "aluminium"],
          },
        ],
        notes: null,
      };
    } else {
      data = {
        categorySlug: null,
        title: "General packaging request",
        attributes: {},
        quantity: null,
        unit: null,
        neededBy: null,
        deliveryArea: null,
        preferredPaymentTerm: null,
        priority: null,
        uncertainFields: [],
        questions: [],
        notes: null,
      };
    }

    const inputTokens = 120;
    const outputTokens = 150;
    // Price per token: $0.15/1M in ($0.00000015), $0.60/1M out ($0.0000006)
    let costUsd = inputTokens * 0.00000015 + outputTokens * 0.0000006;

    if (this.simulateOverrun) {
      // Intentionally report higher cost than reserved for test
      costUsd = 100.0;
    }

    return {
      data: schema.parse(data),
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs: Date.now() - start,
      model: "mock-gpt-4o",
      provider: "mock",
    };
  }

  async complete(prompt: string, options: AiOptions): Promise<AiResult<string>> {
    const start = Date.now();
    return {
      data: "Mock response summary without digits.",
      inputTokens: 50,
      outputTokens: 20,
      costUsd: 0.000015,
      latencyMs: Date.now() - start,
      model: "mock-gpt-4o",
      provider: "mock",
    };
  }

  async transcribe(
    audioBuffer: Buffer,
    mimeType: string,
    options?: { timeoutMs?: number }
  ): Promise<{ text: string }> {
    return {
      text: "কাল মিরপুরে ৫০০টা ৭৫০ মিলি ঢাকনাওয়ালা কন্টেইনার লাগবে",
    };
  }
}

export function getAiProvider(): AiProvider {
  return new MockAiProvider();
}
