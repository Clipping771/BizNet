import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

/** GET /api/settings/public — the feature switches the UI needs (no secrets). */
export async function GET() {
  const [leadCreditsEnabled, translationEnabled, aiEnabled, aiListingWriterEnabled, aiQuoteAssistantEnabled, aiDiscussionAnswersEnabled] = await Promise.all([
    getSetting("leadCreditsEnabled"),
    getSetting("translationEnabled"),
    getSetting("aiEnabled"),
    getSetting("aiListingWriterEnabled"),
    getSetting("aiQuoteAssistantEnabled"),
    getSetting("aiDiscussionAnswersEnabled"),
  ]);
  return NextResponse.json(
    {
      leadCreditsEnabled,
      translationEnabled,
      aiListingWriterEnabled: aiEnabled && aiListingWriterEnabled,
      aiQuoteAssistantEnabled: aiEnabled && aiQuoteAssistantEnabled,
      aiDiscussionAnswersEnabled: aiEnabled && aiDiscussionAnswersEnabled,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
