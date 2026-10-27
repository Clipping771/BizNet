import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import {
  revealContactRecord,
  getContactVisibility,
  getConversationWithBusinesses,
  getConversationById,
} from "@/lib/repo/messaging";
import { limitMutation } from "@/lib/http/guard";

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

    const conv = await getConversationWithBusinesses(id);

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const isBuyer = ctx.activeBusinessId === conv.buyerBusinessId;
    const isSupplier = ctx.activeBusinessId === conv.supplierBusinessId;

    if (!isBuyer && !isSupplier && ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const visibility = await getContactVisibility(
      conv.buyerBusinessId,
      conv.supplierBusinessId
    );

    // Filter contact details according to visibility rules (§8.12, I4)
    let buyerContact: any = null;
    let supplierContact: any = null;

    if (visibility.supplierCanSeeBuyer || ctx.role === "ADMIN") {
      buyerContact = {
        name: conv.buyerBusiness.name,
        area: conv.buyerBusiness.area,
        city: conv.buyerBusiness.city,
        addressLine: conv.buyerBusiness.addressLine,
        phonePublic: conv.buyerBusiness.phonePublic,
        whatsapp: conv.buyerBusiness.whatsapp,
      };
    }

    if (visibility.buyerCanSeeSupplier || ctx.role === "ADMIN") {
      supplierContact = {
        name: conv.supplierBusiness.name,
        area: conv.supplierBusiness.area,
        city: conv.supplierBusiness.city,
        addressLine: conv.supplierBusiness.addressLine,
        phonePublic: conv.supplierBusiness.phonePublic,
        whatsapp: conv.supplierBusiness.whatsapp,
      };
    }

    return NextResponse.json({
      visibility,
      buyerContact,
      supplierContact,
    });
  } catch (err: any) {
    console.error("Contact visibility error:", err);
    return NextResponse.json({ error: "Failed to fetch contact details" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limited = await limitMutation(req, "reveal-contact", 30);
    if (limited) return limited;
    const { id } = await params;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    const conv = await getConversationById(id);

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    if (conv.buyerBusinessId !== ctx.activeBusinessId && ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Only the buyer can reveal contacts" }, { status: 403 });
    }

    const reveal = await revealContactRecord(
      conv.buyerBusinessId,
      conv.supplierBusinessId,
      user.id
    );

    return NextResponse.json(reveal);
  } catch (err: any) {
    console.error("Reveal contact error:", err);
    return NextResponse.json({ error: err.message || "Failed to reveal contact" }, { status: 400 });
  }
}
