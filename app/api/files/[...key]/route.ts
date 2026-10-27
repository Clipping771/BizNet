import { NextRequest, NextResponse } from "next/server";
import { PlatformRole } from "@prisma/client";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { getPrivateFileSignedUrl } from "@/lib/storage";
import { findQuoteByAttachmentKey } from "@/lib/repo/quote";
import { findMessageByAttachmentKey } from "@/lib/repo/messaging";

/**
 * Quote and message attachments are readable by the two businesses of the deal
 * (and admins). Returns null when the key is not such an attachment.
 */
async function attachmentParties(key: string): Promise<string[] | null> {
  if (key.startsWith("private/quotes/")) {
    const quote = await findQuoteByAttachmentKey(key);
    return quote ? [quote.supplierBusinessId, quote.request.buyerBusinessId] : [];
  }
  if (key.startsWith("private/messages/")) {
    const message = await findMessageByAttachmentKey(key);
    return message
      ? [message.conversation.buyerBusinessId, message.conversation.supplierBusinessId]
      : [];
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { ctx: dbCtx, error: authError, status: authStatus } = await getAuthzContext(req);
    if (authError || !dbCtx) {
      return NextResponse.json({ error: authError || "Unauthorized" }, { status: authError ? authStatus : 401 });
    }

    const resolvedParams = await params;
    const rawKey = Array.isArray(resolvedParams.key)
      ? resolvedParams.key.map(decodeURIComponent).join("/")
      : decodeURIComponent(resolvedParams.key);

    if (rawKey.includes("..")) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }

    const ctx = dbCtx;

    const parties = await attachmentParties(rawKey);
    if (parties !== null) {
      const allowed =
        ctx.role === PlatformRole.ADMIN ||
        (!!ctx.activeBusinessId && parties.includes(ctx.activeBusinessId));
      if (!allowed) {
        throw new AuthorizationError("Only the buyer and supplier of this deal can open this file");
      }
    } else {
      const isVerificationDocument =
        rawKey.includes("verification") || rawKey.startsWith("private/");

      assertCan(ctx, "file:read_private", {
        isVerificationDocument,
      });
    }

    const signedUrl = await getPrivateFileSignedUrl(rawKey, 300);

    return NextResponse.json({
      url: signedUrl,
      expiresIn: 300,
    });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message || "Failed to generate signed URL" }, { status: 500 });
  }
}
