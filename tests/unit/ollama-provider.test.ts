import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Settings come from the database in the app; here each test sets them directly
const settings: Record<string, unknown> = {};
vi.mock("@/lib/settings", async (orig) => {
  const actual = await orig<typeof import("@/lib/settings")>();
  return { ...actual, getSetting: vi.fn(async (key: string) => (key in settings ? settings[key] : (actual.defaultSettings as any)[key])) };
});

import { OllamaAiProvider, listOllamaModels, normalizeOllamaUrl } from "@/lib/ai/ollama";
import { buildAiProvider, getAiProvider, MockAiProvider, resolveAiProviderConfig } from "@/lib/ai/provider";
import { ollamaHasModel, testAiConnection } from "@/lib/ai/testConnection";

const schema = z.object({ title: z.string() });
const fetchMock = vi.fn();

const json = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const chatReply = (content: string, extra: Record<string, unknown> = {}) =>
  json({ model: "llama3.1", message: { role: "assistant", content }, done_reason: "stop", prompt_eval_count: 42, eval_count: 7, ...extra });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  for (const k of Object.keys(settings)) delete settings[k];
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("OLLAMA_BASE_URL", "");
  vi.stubEnv("OLLAMA_MODEL", "");
  vi.stubEnv("OLLAMA_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("OllamaAiProvider", () => {
  it("posts a non-streaming chat with the schema as format and parses the answer", async () => {
    fetchMock.mockResolvedValue(chatReply('{"title":"Box"}'));
    const res = await new OllamaAiProvider({ baseUrl: "http://gpu:11434/", model: "qwen2.5:7b" }).structured(schema, "Write", { maxOutputTokens: 500 });

    expect(res.data).toEqual({ title: "Box" });
    expect(res.provider).toBe("ollama");
    expect(res.inputTokens).toBe(42);
    expect(res.outputTokens).toBe(7);
    expect(res.costUsd).toBe(0);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://gpu:11434/api/chat");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("qwen2.5:7b");
    expect(body.stream).toBe(false);
    expect(body.format.properties.title.type).toBe("string");
    expect(body.options.num_predict).toBe(500);
    expect(body.messages[0].content).toContain('"title"');
  });

  it("sends no format for plain completions", async () => {
    fetchMock.mockResolvedValue(chatReply("OK"));
    const res = await new OllamaAiProvider().complete("Hi", { maxOutputTokens: 20 });
    expect(res.data).toBe("OK");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).format).toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:11434/api/chat");
  });

  it("accepts JSON wrapped in a code fence", async () => {
    fetchMock.mockResolvedValue(chatReply('```json\n{"title":"Cup"}\n```'));
    const res = await new OllamaAiProvider().structured(schema, "Write", { maxOutputTokens: 100 });
    expect(res.data.title).toBe("Cup");
  });

  it("sends a bearer token when an API key is set", async () => {
    fetchMock.mockResolvedValue(chatReply("OK"));
    await new OllamaAiProvider({ apiKey: "secret" }).complete("Hi", { maxOutputTokens: 20 });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer secret");
  });

  it("reports Ollama's own error, e.g. a missing model", async () => {
    fetchMock.mockResolvedValue(json({ error: 'model "nope" not found, try pulling it first' }, 404));
    await expect(new OllamaAiProvider({ model: "nope" }).complete("Hi", { maxOutputTokens: 20 })).rejects.toThrow(/AI_PROVIDER_ERROR: Ollama 404: model "nope" not found/);
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(new OllamaAiProvider().complete("Hi", { maxOutputTokens: 20 })).rejects.toThrow(/AI_UNREACHABLE/);
  });

  it("treats a cut-off answer as a failure", async () => {
    fetchMock.mockResolvedValue(chatReply('{"title":', { done_reason: "length" }));
    await expect(new OllamaAiProvider().structured(schema, "Write", { maxOutputTokens: 5 })).rejects.toThrow("AI_TRUNCATED");
  });

  it("rejects an answer that does not match the schema", async () => {
    fetchMock.mockResolvedValue(chatReply('{"name":"Box"}'));
    await expect(new OllamaAiProvider().structured(schema, "Write", { maxOutputTokens: 100 })).rejects.toThrow();
  });

  it("has no speech-to-text, so voice falls back to typing", async () => {
    await expect(new OllamaAiProvider().transcribe()).rejects.toThrow("AI_TRANSCRIPTION_UNAVAILABLE");
  });
});

describe("Ollama helpers", () => {
  it.each([
    ["", "http://127.0.0.1:11434"],
    ["localhost:11434", "http://127.0.0.1:11434"],
    ["http://LOCALHOST:11434/", "http://127.0.0.1:11434"],
    ["http://localhost-gpu:11434", "http://localhost-gpu:11434"],
    ["https://ollama.example.com/", "https://ollama.example.com"],
    ["  http://10.0.0.5:11434//  ", "http://10.0.0.5:11434"],
  ])("normalizes %j to %s", (input, out) => {
    expect(normalizeOllamaUrl(input)).toBe(out);
  });

  it("lists installed models from /api/tags", async () => {
    fetchMock.mockResolvedValue(json({ models: [{ name: "llama3.1:latest", size: 4.9e9, details: { family: "llama", parameter_size: "8.0B" } }] }));
    const models = await listOllamaModels("localhost:11434");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:11434/api/tags");
    expect(models).toEqual([{ name: "llama3.1:latest", sizeBytes: 4.9e9, family: "llama", parameterSize: "8.0B" }]);
  });

  it("matches a model given without a tag to its :latest install", () => {
    const models = [{ name: "llama3.1:latest" }, { name: "qwen2.5:7b" }];
    expect(ollamaHasModel(models, "llama3.1")).toBe(true);
    expect(ollamaHasModel(models, "qwen2.5:7b")).toBe(true);
    expect(ollamaHasModel(models, "qwen2.5")).toBe(false);
  });
});

describe("choosing the provider", () => {
  it('follows AI_PROVIDER while the setting is "env"', async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    expect((await resolveAiProviderConfig()).name).toBe("mock");
    expect(await getAiProvider()).toBeInstanceOf(MockAiProvider);
  });

  it("uses Ollama with the saved URL and model when an admin picks it", async () => {
    settings.aiProvider = "ollama";
    settings.ollamaBaseUrl = "http://gpu-box:11434";
    settings.ollamaModel = "qwen2.5:7b";
    const provider = (await getAiProvider()) as OllamaAiProvider;
    expect(provider).toBeInstanceOf(OllamaAiProvider);
    expect(provider.baseUrl).toBe("http://gpu-box:11434");
    expect(provider.model).toBe("qwen2.5:7b");
  });

  it("falls back to OLLAMA_BASE_URL / OLLAMA_MODEL, then the local defaults", async () => {
    settings.aiProvider = "ollama";
    vi.stubEnv("OLLAMA_BASE_URL", "http://env-host:11434");
    let cfg = await resolveAiProviderConfig();
    expect(cfg).toMatchObject({ name: "ollama", ollamaBaseUrl: "http://env-host:11434", ollamaModel: "llama3.1" });

    vi.stubEnv("OLLAMA_BASE_URL", "");
    cfg = await resolveAiProviderConfig();
    expect(cfg.ollamaBaseUrl).toBe("http://localhost:11434");
  });

  it("refuses an unknown provider, so callers fall back to the manual form", () => {
    expect(() => buildAiProvider({ name: "gpt" })).toThrow("Unsupported AI_PROVIDER: gpt");
  });
});

describe("testAiConnection", () => {
  it("passes when the server is up, the model is installed and it answers", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ models: [{ name: "llama3.1:latest" }] }))
      .mockResolvedValueOnce(chatReply("OK"));
    const res = await testAiConnection({ name: "ollama", ollamaBaseUrl: "localhost:11434", ollamaModel: "llama3.1" });
    expect(res).toMatchObject({ ok: true, provider: "ollama", baseUrl: "http://127.0.0.1:11434", modelInstalled: true, reply: "OK" });
    expect(res.models).toHaveLength(1);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("says the server cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const res = await testAiConnection({ name: "ollama", ollamaBaseUrl: "http://nowhere:11434", ollamaModel: "llama3.1" });
    expect(res).toMatchObject({ ok: false, failedAt: "connect" });
    expect(res.error).toContain("http://nowhere:11434");
  });

  it("says which model to pull when it is missing", async () => {
    fetchMock.mockResolvedValueOnce(json({ models: [{ name: "mistral:latest" }] }));
    const res = await testAiConnection({ name: "ollama", ollamaModel: "llama3.1" });
    expect(res).toMatchObject({ ok: false, failedAt: "model", modelInstalled: false });
    expect(res.error).toContain("ollama pull llama3.1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a model that fails on the prompt", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ models: [{ name: "llama3.1:latest" }] }))
      .mockResolvedValueOnce(json({ error: "out of memory" }, 500));
    const res = await testAiConnection({ name: "ollama", ollamaModel: "llama3.1" });
    expect(res).toMatchObject({ ok: false, failedAt: "prompt" });
    expect(res.error).toContain("out of memory");
  });

  it("can test the mock provider without any server", async () => {
    const res = await testAiConnection({ name: "mock" });
    expect(res.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
