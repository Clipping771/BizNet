import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import {
  sendMessageRecord,
  listMessagesForConversation,
  getConversationById,
  markConversationRead,
} from "@/lib/repo/messaging";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    const conv = await getConversationById(id);

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    if (
      conv.buyerBusinessId !== ctx.activeBusinessId &&
      conv.supplierBusinessId !== ctx.activeBusinessId &&
      ctx.role !== "ADMIN"
    ) {
      return NextResponse.json({ error: "IDOR: Cannot read another business's messages" }, { status: 403 });
    }

    if (ctx.activeBusinessId === conv.buyerBusinessId || ctx.activeBusinessId === conv.supplierBusinessId) {
      await markConversationRead(id, ctx.activeBusinessId);
    }
    const messages = await listMessagesForConversation(id);
    return NextResponse.json(messages);
  } catch (err: any) {
    console.error("List messages error:", err);
    return NextResponse.json({ error: "Failed to list messages" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    if (!ctx.activeBusinessId) {
      return NextResponse.json({ error: "Active business required" }, { status: 403 });
    }

    const conv = await getConversationById(id);

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    if (
      conv.buyerBusinessId !== ctx.activeBusinessId &&
      conv.supplierBusinessId !== ctx.activeBusinessId &&
      ctx.role !== "ADMIN"
    ) {
      return NextResponse.json({ error: "IDOR: Cannot send messages in another business's conversation" }, { status: 403 });
    }

    const body = await req.json();
    const { body: messageText, attachmentKeys } = body;

    if (!messageText || !messageText.trim()) {
      return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    }

    const result = await sendMessageRecord({
      conversationId: id,
      senderUserId: user.id,
      senderBusinessId: ctx.activeBusinessId,
      body: messageText,
      attachmentKeys,
      lang: user.uiLanguage || "bn",
    });

    if (result.blocked) {
      // Soft block per §8.12 I3
      return NextResponse.json(
        {
          blocked: true,
          error: result.error,
          pattern: result.pattern,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(result.message, { status: 201 });
  } catch (err: any) {
    console.error("Send message error:", err);
    return NextResponse.json({ error: err.message || "Failed to send message" }, { status: 400 });
  }
}
