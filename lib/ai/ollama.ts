/**
 * lib/ai/ollama.ts
 *
 * Ollama adapter for AiProvider. Selected in Admin → Settings (AI provider = "ollama"), or with
 * AI_PROVIDER=ollama. Talks to Ollama's REST API (`/api/chat`, `/api/tags`), so it works with a local
 * Ollama, one on another machine, or Ollama Cloud (set OLLAMA_API_KEY for a bearer token).
 *
 * Structured answers pass the JSON Schema as Ollama's `format`, so the model is constrained to it,
 * and the caller's Zod schema still checks the result. Local models cost nothing per token.
 */

import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AiOptions, AiProvider, AiResult } from "@/lib/ai/provider";

export const OLLAMA_DEFAULT_URL = "http://localhost:11434";
export const OLLAMA_DEFAULT_MODEL = "llama3.1";

interface OllamaChatResponse {
  model?: string;
  message?: { role: string; content: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export interface OllamaModelInfo {
  name: string;
  sizeBytes?: number;
  family?: string;
  parameterSize?: string;
}

/**
 * "http://host:11434/" and "host:11434" both become "http://host:11434". "localhost" becomes 127.0.0.1:
 * Node 22 resolves localhost to ::1 first, and Ollama listens on IPv4 only by default.
 */
export function normalizeOllamaUrl(url: string | null | undefined): string {
  let u = (url || "").trim() || OLLAMA_DEFAULT_URL;
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  u = u.replace(/^(https?:\/\/)localhost(?=[:/]|$)/i, "$1127.0.0.1");
  return u.replace(/\/+$/, "");
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

/** Lists the models installed on an Ollama server (GET /api/tags). Throws when it cannot be reached. */
export async function listOllamaModels(baseUrl: string, opts: { apiKey?: string; timeoutMs?: number } = {}): Promise<OllamaModelInfo[]> {
  const res = await fetch(`${normalizeOllamaUrl(baseUrl)}/api/tags`, {
    headers: authHeaders(opts.apiKey),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
  });
  if (!res.ok) throw new Error(`Ollama answered HTTP ${res.status}`);
  const json = (await res.json()) as { models?: Array<{ name: string; size?: number; details?: { family?: string; parameter_size?: string } }> };
  return (json.models ?? []).map((m) => ({
    name: m.name,
    sizeBytes: m.size,
    family: m.details?.family,
    parameterSize: m.details?.parameter_size,
  }));
}

export class OllamaAiProvider implements AiProvider {
  readonly baseUrl: string;
  readonly model: string;
  private apiKey?: string;

  constructor(opts: { baseUrl?: string; model?: string; apiKey?: string } = {}) {
    this.baseUrl = normalizeOllamaUrl(opts.baseUrl);
    this.model = (opts.model || "").trim() || OLLAMA_DEFAULT_MODEL;
    this.apiKey = opts.apiKey || undefined;
  }

  private async chat(prompt: string, options: AiOptions, format?: unknown) {
    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(this.apiKey) },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          ...(format ? { format } : {}),
          // Low temperature: these are extraction and drafting calls, not creative writing
          options: { num_predict: options.maxOutputTokens, temperature: 0.2 },
        }),
      });
    } catch (err: any) {
      throw new Error(`AI_UNREACHABLE: cannot reach Ollama at ${this.baseUrl} (${err?.message ?? err})`);
    }

    const body = (await res.json().catch(() => ({}))) as OllamaChatResponse;
    if (!res.ok || body.error) {
      throw new Error(`AI_PROVIDER_ERROR: Ollama ${res.status}${body.error ? `: ${body.error}` : ""}`);
    }
    if (body.done_reason === "length") throw new Error("AI_TRUNCATED");

    return {
      text: body.message?.content ?? "",
      inputTokens: body.prompt_eval_count ?? 0,
      outputTokens: body.eval_count ?? 0,
      // Self-hosted: no per-token charge
      costUsd: 0,
      latencyMs: Date.now() - start,
      model: body.model || this.model,
      provider: "ollama",
    };
  }

  async structured<T>(schema: z.ZodSchema<T>, prompt: string, options: AiOptions): Promise<AiResult<T>> {
    const jsonSchema = zodToJsonSchema(schema);
    const { text, ...meta } = await this.chat(
      `${prompt}\n\nReturn only one JSON object matching this JSON Schema, with no other text:\n${JSON.stringify(jsonSchema)}`,
      options,
      jsonSchema
    );
    const json = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    return { ...meta, data: schema.parse(JSON.parse(json)) };
  }

  async complete(prompt: string, options: AiOptions): Promise<AiResult<string>> {
    const { text, ...meta } = await this.chat(prompt, options);
    return { ...meta, data: text };
  }

  /** Ollama has no speech-to-text endpoint; callers already fall back to typing when this throws. */
  async transcribe(): Promise<{ text: string }> {
    throw new Error("AI_TRANSCRIPTION_UNAVAILABLE");
  }
}
