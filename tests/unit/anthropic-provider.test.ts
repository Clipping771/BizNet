import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

import { AnthropicAiProvider } from "@/lib/ai/anthropic";

const schema = z.object({ title: z.string() });
const reply = (text: string, stop_reason = "end_turn") => ({
  stop_reason,
  content: [{ type: "thinking", thinking: "" }, { type: "text", text }],
  usage: { input_tokens: 1000, output_tokens: 100 },
});

describe("AnthropicAiProvider", () => {
  beforeEach(() => {
    create.mockReset();
    vi.stubEnv("AI_PROVIDER", "anthropic");
  });

  it("asks Opus 5.5 with fallback enabled and checks the answer against the schema", async () => {
    create.mockResolvedValue(reply('{"title":"Box"}'));
    const res = await new AnthropicAiProvider("key").structured(schema, "Write", { maxOutputTokens: 2500 });
    expect(res.data).toEqual({ title: "Box" });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.max_tokens).toBe(2500);
    expect(params.messages[0].content).toContain('"title"');
  });

  it("prices the call at $4 / $20 per million tokens", async () => {
    create.mockResolvedValue(reply('{"title":"Box"}'));
    const res = await new AnthropicAiProvider("key").structured(schema, "Write", { maxOutputTokens: 2500 });
    expect(res.costUsd).toBeCloseTo(1000 * 0.000004 + 100 * 0.00002, 8);
  });

  it("accepts JSON wrapped in a code fence", async () => {
    create.mockResolvedValue(reply('```json\n{"title":"Box"}\n```'));
    const res = await new AnthropicAiProvider("key").structured(schema, "Write", { maxOutputTokens: 100 });
    expect(res.data.title).toBe("Box");
  });

  it.each([
    ["refusal", "AI_REFUSED"],
    ["max_tokens", "AI_TRUNCATED"],
  ])("treats stop reason %s as a failure", async (stop, error) => {
    create.mockResolvedValue(reply("", stop));
    await expect(new AnthropicAiProvider("key").complete("Hi", { maxOutputTokens: 100 })).rejects.toThrow(error);
  });

  it("rejects an answer that does not match the schema", async () => {
    create.mockResolvedValue(reply('{"name":"Box"}'));
    await expect(new AnthropicAiProvider("key").structured(schema, "Write", { maxOutputTokens: 100 })).rejects.toThrow();
  });

  it("has no speech-to-text, so voice falls back to typing", async () => {
    await expect(new AnthropicAiProvider("key").transcribe()).rejects.toThrow("AI_TRANSCRIPTION_UNAVAILABLE");
  });
});
