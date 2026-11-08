import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin/route";
import { testAiConnection } from "@/lib/ai/testConnection";

/**
 * POST /api/admin/ai/test { provider?, ollamaBaseUrl?, ollamaModel? } — admin only.
 * Sends a tiny prompt through the provider; empty fields use the saved settings, so an admin can test
 * values before saving them.
 */
export const POST = adminRoute("AI connection test error", async (req) => {
  const body = await req.json().catch(() => ({}));
  const result = await testAiConnection({
    name: typeof body.provider === "string" ? body.provider : undefined,
    ollamaBaseUrl: typeof body.ollamaBaseUrl === "string" ? body.ollamaBaseUrl : undefined,
    ollamaModel: typeof body.ollamaModel === "string" ? body.ollamaModel : undefined,
  });
  return NextResponse.json(result);
});
