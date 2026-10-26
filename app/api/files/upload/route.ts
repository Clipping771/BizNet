import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { validateUploadParams } from "@/lib/storage";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { filename, contentType, sizeBytes, purpose } = body;

    if (!filename || !contentType || !sizeBytes || !purpose) {
      return NextResponse.json({ error: "Missing required upload parameters" }, { status: 400 });
    }

    const validation = validateUploadParams({ contentType, sizeBytes, purpose });
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Generate safe key
    const uniqueId = crypto.randomBytes(16).toString("hex");
    const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const isPrivate = purpose === "verification_document";
    const prefix = isPrivate ? "private/verification" : "public/listings";
    const key = `${prefix}/${uniqueId}-${sanitizedName}`;

    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const uploadUrl = `${baseUrl}/api/files/upload/${encodeURIComponent(key)}`;

    return NextResponse.json({
      uploadUrl,
      key,
      method: "PUT",
      expiresIn: 900,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to initialize upload" }, { status: 500 });
  }
}
