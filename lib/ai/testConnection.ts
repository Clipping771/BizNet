/**
 * lib/ai/testConnection.ts — the admin "Test connection" check for the AI provider.
 *
 * Runs a tiny real prompt through the chosen provider. For Ollama it first lists the installed
 * models, so "server unreachable" and "model not pulled" are reported separately from a bad answer.
 */

import { buildAiProvider, resolveAiProviderConfig, type AiProviderConfig } from "@/lib/ai/provider";
import { listOllamaModels, normalizeOllamaUrl, type OllamaModelInfo } from "@/lib/ai/ollama";

export interface AiTestResult {
  ok: boolean;
  provider: string;
  model?: string;
  baseUrl?: string;
  /** Ollama only: models installed on the server */
  models?: OllamaModelInfo[];
  /** Ollama only: whether the chosen model is among them */
  modelInstalled?: boolean;
  reply?: string;
  latencyMs?: number;
  /** Which step failed: reaching the server, finding the model, or the test prompt */
  failedAt?: "connect" | "model" | "prompt";
  error?: string;
}

const TEST_PROMPT = "This is a connection test. Reply with exactly one word: OK";

/** `name` matches `name:latest`, the tag Ollama adds when none is given. */
export function ollamaHasModel(models: OllamaModelInfo[], model: string): boolean {
  const want = model.includes(":") ? model : `${model}:latest`;
  return models.some((m) => m.name === model || m.name === want);
}

export async function testAiConnection(overrides: Partial<AiProviderConfig> = {}, opts: { timeoutMs?: number } = {}): Promise<AiTestResult> {
  const resolved = await resolveAiProviderConfig();
  const config: AiProviderConfig = {
    name: overrides.name && overrides.name !== "env" ? overrides.name : resolved.name,
    ollamaBaseUrl: overrides.ollamaBaseUrl?.trim() || resolved.ollamaBaseUrl,
    ollamaModel: overrides.ollamaModel?.trim() || resolved.ollamaModel,
  };
  const result: AiTestResult = { ok: false, provider: config.name };

  if (config.name === "ollama") {
    result.baseUrl = normalizeOllamaUrl(config.ollamaBaseUrl);
    result.model = config.ollamaModel;
    try {
      result.models = await listOllamaModels(result.baseUrl, { apiKey: process.env.OLLAMA_API_KEY });
    } catch (err: any) {
      return {
        ...result,
        failedAt: "connect",
        error: `Cannot reach Ollama at ${result.baseUrl}: ${err?.name === "TimeoutError" ? "timed out" : err?.message ?? err}`,
      };
    }
    result.modelInstalled = ollamaHasModel(result.models, config.ollamaModel || "");
    if (!result.modelInstalled) {
      return { ...result, failedAt: "model", error: `Model "${config.ollamaModel}" is not installed. Run: ollama pull ${config.ollamaModel}` };
    }
  }

  let provider;
  try {
    provider = buildAiProvider(config);
  } catch (err: any) {
    return { ...result, failedAt: "connect", error: err?.message ?? String(err) };
  }

  const start = Date.now();
  try {
    // A cold local model can take a while to load the first time
    const timeoutMs = opts.timeoutMs ?? 90000;
    const answer = await Promise.race([
      provider.complete(TEST_PROMPT, { maxOutputTokens: 400 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`No answer within ${Math.round(timeoutMs / 1000)}s`)), timeoutMs)),
    ]);
    return { ...result, ok: true, model: answer.model || result.model, reply: answer.data.trim().slice(0, 200), latencyMs: Date.now() - start };
  } catch (err: any) {
    return { ...result, failedAt: "prompt", latencyMs: Date.now() - start, error: err?.message ?? String(err) };
  }
}
