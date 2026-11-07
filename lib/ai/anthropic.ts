/**
 * lib/ai/anthropic.ts
 *
 * Claude adapter for AiProvider (§3). Selected with AI_PROVIDER=anthropic and AI_API_KEY.
 * Low effort: these are short extraction and drafting calls behind a timeout and a daily budget.
 * A declined request re-runs server-side on Anthropic's recommended fallback model.
 *
 * The JSON Schema goes in the prompt and the answer is checked by the caller's Zod schema. The SDK's
 * output-format helper takes Zod 4 schemas and this project is on Zod 3, and the request assistant's
 * free-form attributes map could not be a strict format anyway.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AiOptions, AiProvider, AiResult } from "@/lib/ai/provider";
import { aiPricesPerToken } from "@/lib/ai/pricing";

const DEFAULT_MODEL = "claude-opus-5-5";

export class AnthropicAiProvider implements AiProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model?: string) {
    // Callers enforce their own timeout and retry once; the SDK adds no hidden waiting on top
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
    this.model = model || DEFAULT_MODEL;
  }

  private async send(prompt: string, options: AiOptions) {
    const start = Date.now();
    const message = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: options.maxOutputTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    });
    if (message.stop_reason === "refusal") throw new Error("AI_REFUSED");
    if (message.stop_reason === "max_tokens") throw new Error("AI_TRUNCATED");

    const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    const prices = aiPricesPerToken();
    return {
      text,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      costUsd: message.usage.input_tokens * prices.in + message.usage.output_tokens * prices.out,
      latencyMs: Date.now() - start,
      model: this.model,
      provider: "anthropic",
    };
  }

  async structured<T>(schema: z.ZodSchema<T>, prompt: string, options: AiOptions): Promise<AiResult<T>> {
    const shape = JSON.stringify(zodToJsonSchema(schema));
    const { text, ...meta } = await this.send(`${prompt}\n\nReturn only one JSON object matching this JSON Schema, with no other text:\n${shape}`, options);
    const json = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    return { ...meta, data: schema.parse(JSON.parse(json)) };
  }

  async complete(prompt: string, options: AiOptions): Promise<AiResult<string>> {
    const { text, ...meta } = await this.send(prompt, options);
    return { ...meta, data: text };
  }

  /** Claude has no speech-to-text; callers already fall back to typing when this throws. */
  async transcribe(): Promise<{ text: string }> {
    throw new Error("AI_TRANSCRIPTION_UNAVAILABLE");
  }
}
