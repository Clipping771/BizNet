import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { processVoiceTranscription } from "@/lib/ai/voiceTranscription";

export async function POST(req: NextRequest) {
  try {
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const duration = formData.get("durationSeconds");
    const durationSeconds = duration ? Number(duration) : undefined;

    if (!file) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    // Check size limit: 2MB
    const sizeBytes = file.size;
    if (sizeBytes > 2 * 1024 * 1024) {
      return NextResponse.json(
        {
          success: false,
          fallback: true,
          error: "Audio size exceeds 2MB limit",
        },
        { status: 400 }
      );
    }

    // The client reports the recording length; without a valid one we cannot enforce the 60 s limit
    if (durationSeconds === undefined || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return NextResponse.json(
        { success: false, fallback: true, error: "Couldn't hear that — please type or try again" },
        { status: 400 }
      );
    }

    if (durationSeconds > 60) {
      return NextResponse.json(
        {
          success: false,
          fallback: true,
          error: "Audio duration exceeds 60s limit",
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    const result = await processVoiceTranscription({
      audioBuffer,
      mimeType: file.type || "audio/webm",
      sizeBytes,
      durationSeconds,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Transcribe error:", err);
    return NextResponse.json(
      {
        success: false,
        fallback: true,
        error: "Couldn't hear that — please type or try again",
      },
      { status: 500 }
    );
  }
}
