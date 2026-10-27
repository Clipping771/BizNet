/**
 * Voice limits (§8.4): > 60 s, > 2 MB, missing duration or unsupported format are rejected
 * with the fallback flag; a valid recording is transcribed (mock STT) and never stored.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions } from "@/lib/session";
import { POST as transcribe } from "@/app/api/ai/transcribe/route";

const BASE = "http://localhost:3000";

function upload(cookie: string, opts: { bytes: number; type?: string; duration?: string }) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(opts.bytes)], { type: opts.type ?? "audio/webm" }), "recording");
  if (opts.duration !== undefined) form.append("durationSeconds", opts.duration);
  return transcribe(new NextRequest(`${BASE}/api/ai/transcribe`, { method: "POST", headers: { cookie }, body: form }));
}

describe("voice transcription limits", () => {
  let cookie: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { phone: `+88018${Math.floor(10000000 + Math.random() * 90000000)}`, name: "Voice User", phoneVerified: true },
    });
    cookie = `biznet_session=${await sealData({ userId: user.id, isLoggedIn: true }, sessionOptions)}`;
  });

  it("rejects recordings longer than 60 s with fallback", async () => {
    const res = await upload(cookie, { bytes: 1000, duration: "61" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, fallback: true });
  });

  it("rejects recordings larger than 2 MB with fallback", async () => {
    const res = await upload(cookie, { bytes: 2 * 1024 * 1024 + 1, duration: "10" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, fallback: true });
  });

  it("rejects recordings without a duration", async () => {
    const res = await upload(cookie, { bytes: 1000 });
    expect(res.status).toBe(400);
    expect((await res.json()).fallback).toBe(true);
  });

  it("rejects unsupported formats with fallback", async () => {
    const res = await upload(cookie, { bytes: 1000, duration: "5", type: "video/mp4" });
    expect((await res.json()).fallback).toBe(true);
  });

  it("transcribes a valid recording", async () => {
    const res = await upload(cookie, { bytes: 1000, duration: "5" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.text).toBeTruthy();
  });
});
