import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-user";
import { assertCan } from "@/lib/authz";
import { createBusiness } from "@/lib/repo/business";
import { logAudit } from "@/lib/audit";
import { logEvent } from "@/lib/events";

export async function POST(req: NextRequest) {
  try {
    const { user, session, error, status } = await getAuthedUser(req);
    if (error || !user) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    // Check authorization: verified phone or email required
    assertCan(
      {
        userId: user.id,
        role: user.role || "USER",
        phoneVerified: user.phoneVerified,
        emailVerified: user.emailVerified,
      },
      "business:create"
    );

    const body = await req.json();
    const business = await createBusiness(user.id, {
      name: body.name,
      businessType: body.businessType,
      isBuyer: Boolean(body.isBuyer),
      isSupplier: Boolean(body.isSupplier),
      area: body.area,
      city: body.city || "Dhaka",
      addressLine: body.addressLine,
      whatsapp: body.whatsapp,
      phonePublic: body.phonePublic,
      deliveryAreas: body.deliveryAreas,
    });

    // Update active business in session
    session.activeBusinessId = business.id;
    await session.save();

    await logAudit({
      actorUserId: user.id,
      actorBusinessId: business.id,
      action: "business:create",
      entityType: "BUSINESS",
      entityId: business.id,
      after: { name: business.name, isBuyer: business.isBuyer, isSupplier: business.isSupplier },
    });

    await logEvent({
      name: "business_created",
      userId: user.id,
      businessId: business.id,
      props: { isBuyer: business.isBuyer, isSupplier: business.isSupplier },
    });

    return NextResponse.json({ success: true, business });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: err.name === "AuthorizationError" ? 403 : 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user, session, error, status } = await getAuthedUser(req);
    if (error || !user) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    const { listUserBusinesses } = await import("@/lib/repo/business");
    const businesses = await listUserBusinesses(user.id);

    return NextResponse.json({
      success: true,
      businesses,
      activeBusinessId: session.activeBusinessId || user.activeBusinessId,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
