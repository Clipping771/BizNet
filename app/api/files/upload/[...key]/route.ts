import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-user";
import { fileExists, putFile, verifyUploadTicket } from "@/lib/storage";
import { limitMutation } from "@/lib/http/guard";

/**
 * Receives the bytes for an upload ticket issued by POST /api/files/upload.
 * The signed ticket binds key, content type, size limit, expiry and user.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const limited = await limitMutation(req, "upload-bytes", 60);
    if (limited) return limited;
    const { user, error, status } = await getAuthedUser(req);
    if (error || !user) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    const resolvedParams = await params;
    const key = (Array.isArray(resolvedParams.key) ? resolvedParams.key : [resolvedParams.key])
      .map(decodeURIComponent)
      .join("/");

    const q = req.nextUrl.searchParams;
    const contentType = q.get("ct") || "";
    const maxBytes = Number(q.get("max"));
    const expiresAt = Number(q.get("exp"));
    const sig = q.get("sig") || "";

    if (!verifyUploadTicket({ key, contentType, maxBytes, expiresAt, userId: user.id, sig })) {
      return NextResponse.json({ error: "Upload URL is invalid or has expired" }, { status: 403 });
    }

    const sentType = (req.headers.get("content-type") || "").split(";")[0].trim();
    if (sentType !== contentType) {
      return NextResponse.json({ error: "Content-Type does not match the upload ticket" }, { status: 415 });
    }

    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      return NextResponse.json({ error: "File exceeds the allowed size" }, { status: 413 });
    }

    const isPrivate = key.startsWith("private/");
    if (await fileExists(key, isPrivate)) {
      return NextResponse.json({ error: "File already exists" }, { status: 409 });
    }

    // Stream the body and stop as soon as it exceeds the ticket's limit
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (req.body) {
      const reader = req.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return NextResponse.json({ error: "File exceeds the allowed size" }, { status: 413 });
        }
        chunks.push(value);
      }
    }
    if (total === 0) {
      return NextResponse.json({ error: "Empty upload" }, { status: 400 });
    }

    await putFile(key, Buffer.concat(chunks), contentType, isPrivate);
    return NextResponse.json({ success: true, key });
  } catch (err: any) {
    console.error("File upload error:", err);
    return NextResponse.json({ error: "Failed to store file" }, { status: 500 });
  }
}
