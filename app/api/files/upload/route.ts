import { NextRequest, NextResponse } from "next/server";
import { MemberRole } from "@prisma/client";
import { getAuthedUser } from "@/lib/auth-user";
import { findUserMembership } from "@/lib/repo/membership";
import { createUploadTicket, validateUploadParams, type UploadPurpose } from "@/lib/storage";
import { limitMutation } from "@/lib/http/guard";

const PURPOSES: UploadPurpose[] = [
  "verification_document",
  "listing_image",
  "shop_photo",
  "request_image",
  "quote_attachment",
  "message_attachment",
];

export async function POST(req: NextRequest) {
  try {
    const limited = await limitMutation(req, "upload-ticket", 60);
    if (limited) return limited;
    const { user, session, error, status } = await getAuthedUser(req);
    if (error || !user) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }
    if (!session.activeBusinessId) {
      return NextResponse.json({ error: "An active business is required to upload files" }, { status: 403 });
    }

    // Membership comes from the database, never from the session cookie
    const membership = await findUserMembership(user.id, session.activeBusinessId);
    if (!membership) {
      return NextResponse.json({ error: "Must be a member of the business to upload files" }, { status: 403 });
    }

    const body = await req.json();
    const { filename, contentType, sizeBytes, purpose } = body;

    if (!filename || typeof filename !== "string" || !contentType || !sizeBytes || !PURPOSES.includes(purpose)) {
      return NextResponse.json({ error: "Missing required upload parameters" }, { status: 400 });
    }

    if (
      (purpose === "verification_document" || purpose === "listing_image" || purpose === "shop_photo") &&
      membership.role !== MemberRole.OWNER &&
      membership.role !== MemberRole.MANAGER
    ) {
      return NextResponse.json({ error: "Only OWNER or MANAGER can upload verification or listing files" }, { status: 403 });
    }

    const validation = validateUploadParams({ contentType, sizeBytes: Number(sizeBytes), purpose });
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const ticket = createUploadTicket({
      userId: user.id,
      businessId: session.activeBusinessId,
      filename,
      contentType,
      purpose,
    });

    return NextResponse.json(ticket);
  } catch (err: any) {
    console.error("Upload ticket error:", err);
    return NextResponse.json({ error: "Failed to initialize upload" }, { status: 500 });
  }
}
