import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import {
  getOrCreateConversationRecord,
  listConversationsForBusiness,
} from "@/lib/repo/messaging";
import { findRequestById } from "@/lib/repo/request";
import { limitMutation } from "@/lib/http/guard";

export async function POST(req: NextRequest) {
  try {
    const limited = await limitMutation(req, "conversation-open", 120);
    if (limited) return limited;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    if (!ctx.activeBusinessId) {
      return NextResponse.json({ error: "Active business required" }, { status: 403 });
    }

    const body = await req.json();
    const { requestId, supplierBusinessId } = body;

    if (!requestId || !supplierBusinessId) {
      return NextResponse.json({ error: "Missing requestId or supplierBusinessId" }, { status: 400 });
    }

    const request = await findRequestById(requestId);

    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Verify participant
    if (
      request.buyerBusinessId !== ctx.activeBusinessId &&
      supplierBusinessId !== ctx.activeBusinessId &&
      ctx.role !== "ADMIN"
    ) {
      return NextResponse.json({ error: "IDOR: Cannot create conversation for another business" }, { status: 403 });
    }

    const conv = await getOrCreateConversationRecord(
      requestId,
      request.buyerBusinessId,
      supplierBusinessId
    );

    return NextResponse.json(conv);
  } catch (err: any) {
    console.error("Conversation create error:", err);
    return NextResponse.json({ error: err.message || "Failed to get conversation" }, { status: 403 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    if (!ctx.activeBusinessId) {
      return NextResponse.json({ error: "Active business required" }, { status: 403 });
    }

    const conversations = await listConversationsForBusiness(ctx.activeBusinessId);

    return NextResponse.json(conversations);
  } catch (err: any) {
    console.error("List conversations error:", err);
    return NextResponse.json({ error: "Failed to list conversations" }, { status: 500 });
  }
}
