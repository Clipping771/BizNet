import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { getBusinessById } from "@/lib/repo/business";
import {
  createListing,
  getListingsForBusiness,
  getAllCategories,
  ListingError,
} from "@/lib/repo/listing";
import { PlatformRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.isLoggedIn || !session.userId || !session.activeBusinessId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [listings, categories, business] = await Promise.all([
      getListingsForBusiness(session.activeBusinessId, true),
      getAllCategories(),
      getBusinessById(session.activeBusinessId),
    ]);

    return NextResponse.json({
      listings,
      categories,
      business: {
        id: business?.id,
        isSupplier: business?.isSupplier,
        verificationStatus: business?.verificationStatus,
        isSuspended: business?.isSuspended,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load listings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.isLoggedIn || !session.userId || !session.activeBusinessId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const business = await getBusinessById(session.activeBusinessId);
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    let businessRole = session.businessRole;
    if (!businessRole) {
      const { getUserMembership } = await import("@/lib/repo/membership");
      const membership = await getUserMembership(session.userId, session.activeBusinessId);
      businessRole = membership?.role || undefined;
    }

    const ctx = {
      userId: session.userId,
      role: session.role || PlatformRole.USER,
      activeBusinessId: session.activeBusinessId,
      businessRole: businessRole || null,
    };

    // Strict server assertion (§7, C2, C3)
    assertCan(ctx, "listing:create", {
      businessId: business.id,
      isSupplier: business.isSupplier,
      isSuspended: business.isSuspended,
      verificationStatus: business.verificationStatus,
    });

    const body = await req.json();
    const listing = await createListing(business.id, body);

    return NextResponse.json({ success: true, listing }, { status: 201 });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ListingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || "Failed to create listing" }, { status: 500 });
  }
}
