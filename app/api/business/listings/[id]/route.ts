import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { getBusinessById } from "@/lib/repo/business";
import {
  getListingByIdForBusiness,
  updateListing,
  deleteListing,
  ListingNotFoundError,
  ListingError,
} from "@/lib/repo/listing";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { ctx: dbCtx, error: authError, status: authStatus } = await getAuthzContext(req);
    if (authError || !dbCtx || !dbCtx.activeBusinessId) {
      return NextResponse.json({ error: authError || "Unauthorized" }, { status: authError ? authStatus : 401 });
    }

    const resolvedParams = await params;
    const listing = await getListingByIdForBusiness(dbCtx.activeBusinessId, resolvedParams.id);
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({ listing });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load listing" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { ctx: dbCtx, error: authError, status: authStatus } = await getAuthzContext(req);
    if (authError || !dbCtx || !dbCtx.activeBusinessId) {
      return NextResponse.json({ error: authError || "Unauthorized" }, { status: authError ? authStatus : 401 });
    }

    const business = await getBusinessById(dbCtx.activeBusinessId);
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const ctx = dbCtx;

    assertCan(ctx, "listing:edit", {
      businessId: business.id,
      isSupplier: business.isSupplier,
      isSuspended: business.isSuspended,
      verificationStatus: business.verificationStatus,
    });

    const resolvedParams = await params;
    const body = await req.json();
    const updated = await updateListing(business.id, resolvedParams.id, body);

    return NextResponse.json({ success: true, listing: updated });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ListingNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof ListingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || "Failed to update listing" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { ctx: dbCtx, error: authError, status: authStatus } = await getAuthzContext(req);
    if (authError || !dbCtx || !dbCtx.activeBusinessId) {
      return NextResponse.json({ error: authError || "Unauthorized" }, { status: authError ? authStatus : 401 });
    }

    const business = await getBusinessById(dbCtx.activeBusinessId);
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const ctx = dbCtx;

    assertCan(ctx, "listing:delete", {
      businessId: business.id,
      isSupplier: business.isSupplier,
      isSuspended: business.isSuspended,
      verificationStatus: business.verificationStatus,
    });

    const resolvedParams = await params;
    await deleteListing(business.id, resolvedParams.id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ListingNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json({ error: err.message || "Failed to delete listing" }, { status: 500 });
  }
}
