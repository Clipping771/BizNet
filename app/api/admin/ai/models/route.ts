import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin/route";
import { listOllamaModels, normalizeOllamaUrl } from "@/lib/ai/ollama";
import { resolveAiProviderConfig } from "@/lib/ai/provider";

/** GET /api/admin/ai/models?baseUrl= — the models installed on an Ollama server, for the model picker. */
export const GET = adminRoute("Ollama models error", async (req) => {
  const typed = req.nextUrl.searchParams.get("baseUrl")?.trim();
  const baseUrl = normalizeOllamaUrl(typed || (await resolveAiProviderConfig()).ollamaBaseUrl);
  try {
    return NextResponse.json({ baseUrl, models: await listOllamaModels(baseUrl, { apiKey: process.env.OLLAMA_API_KEY }) });
  } catch (err: any) {
    return NextResponse.json({ baseUrl, models: [], error: `Cannot reach Ollama at ${baseUrl}: ${err?.message ?? err}` }, { status: 502 });
  }
});
