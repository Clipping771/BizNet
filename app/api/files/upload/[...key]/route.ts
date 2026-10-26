import { NextRequest, NextResponse } from "next/server";
import { putFile } from "@/lib/storage";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const rawKey = Array.isArray(resolvedParams.key)
      ? resolvedParams.key.map(decodeURIComponent).join("/")
      : decodeURIComponent(resolvedParams.key);

    const contentType = req.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const isPrivate = rawKey.startsWith("private/");
    await putFile(rawKey, buffer, contentType, isPrivate);

    return NextResponse.json({ success: true, key: rawKey });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to upload file" }, { status: 500 });
  }
}
