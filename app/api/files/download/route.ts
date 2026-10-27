import { NextRequest, NextResponse } from "next/server";
import { verifySignedDownloadToken, getFile } from "@/lib/storage";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    const expires = searchParams.get("expires");
    const sig = searchParams.get("sig");

    if (!key || !expires || !sig) {
      return NextResponse.json({ error: "Missing signed URL parameters" }, { status: 400 });
    }

    const expiresAt = parseInt(expires, 10);
    if (Number.isNaN(expiresAt)) {
      return NextResponse.json({ error: "Invalid expiry timestamp" }, { status: 400 });
    }

    // Verify token & expiry (§8.3, B6, B7)
    const isValid = verifySignedDownloadToken(key, expiresAt, sig);
    if (!isValid) {
      return NextResponse.json({ error: "Signed URL is invalid or has expired" }, { status: 403 });
    }

    const isPrivate = key.startsWith("private/");
    const file = await getFile(key, isPrivate);

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to download file" }, { status: 500 });
  }
}
