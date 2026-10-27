/**
 * lib/ai/voiceTranscription.ts
 *
 * Voice transcription processor (§8.4, A2).
 * Formats: webm/opus, ogg, m4a, mp3. Max 60s, max 2MB.
 * Timeout 15s, 1 retry. Audio is NEVER stored.
 */

import { getAiProvider } from "@/lib/ai/provider";

export interface VoiceTranscriptionParams {
  audioBuffer: Buffer;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
}

export interface VoiceTranscriptionResult {
  success: boolean;
  text?: string;
  error?: string;
  fallback: boolean;
}

const ALLOWED_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/m4a",
  "audio/mp4",
  "audio/mp3",
  "audio/mpeg",
  "audio/x-m4a",
];

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_DURATION_SECONDS = 60; // 60s
const TRANSCRIPTION_TIMEOUT_MS = 15000; // 15s

export async function processVoiceTranscription(
  params: VoiceTranscriptionParams
): Promise<VoiceTranscriptionResult> {
  const { audioBuffer, mimeType, sizeBytes, durationSeconds } = params;

  // 1. Validate size
  if (sizeBytes > MAX_BYTES || audioBuffer.length > MAX_BYTES) {
    return {
      success: false,
      fallback: true,
      error: "Audio size exceeds 2MB limit",
    };
  }

  // 2. Validate duration if provided
  if (durationSeconds !== undefined && durationSeconds > MAX_DURATION_SECONDS) {
    return {
      success: false,
      fallback: true,
      error: "Audio duration exceeds 60s limit",
    };
  }

  // 3. Validate mime type
  const baseMime = mimeType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(baseMime)) {
    return {
      success: false,
      fallback: true,
      error: `Unsupported audio format: ${mimeType}`,
    };
  }

  // 4. Call transcription with 15s timeout and 1 automatic retry
  const provider = getAiProvider();
  let attempts = 0;
  let text = "";

  while (attempts < 2 && !text) {
    attempts++;
    try {
      const transcribePromise = provider.transcribe(audioBuffer, mimeType, {
        timeoutMs: TRANSCRIPTION_TIMEOUT_MS,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("TRANSCRIPTION_TIMEOUT")), TRANSCRIPTION_TIMEOUT_MS)
      );

      const res = await Promise.race([transcribePromise, timeoutPromise]);
      text = res.text;
    } catch (err: any) {
      if (attempts >= 2 || err.message === "TRANSCRIPTION_TIMEOUT") {
        break;
      }
    }
  }

  if (!text) {
    return {
      success: false,
      fallback: true,
      error: "Couldn't hear that — please type or try again",
    };
  }

  // Audio buffer is automatically garbage collected; never saved to disk or DB.
  return {
    success: true,
    text,
    fallback: false,
  };
}
