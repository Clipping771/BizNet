import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { getBusinessById } from "@/lib/repo/business";
import {
  createListing,
  getListingsForBusiness,
  getAllCategories,
  ListingError,
} from "@/lib/repo/listing";
import { limitMutation } from "@/lib/http/guard";

export async function GET(req: NextRequest) {
  try {
    const { ctx: dbCtx, error: authError, status: authStatus } = await getAuthzContext(req);
    if (authError || !dbCtx || !dbCtx.activeBusinessId) {
      return NextResponse.json({ error: authError || "Unauthorized" }, { status: authError ? authStatus : 401 });
    }

    const [listings, categories, business] = await Promise.all([
      getListingsForBusiness(dbCtx.activeBusinessId, true),
      getAllCategories(),
      getBusinessById(dbCtx.activeBusinessId),
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
    const limited = await limitMutation(req, "listing-create", 60);
    if (limited) return limited;
    const { ctx: dbCtx, error: authError, status: authStatus } = await getAuthzContext(req);
    if (authError || !dbCtx || !dbCtx.activeBusinessId) {
      return NextResponse.json({ error: authError || "Unauthorized" }, { status: authError ? authStatus : 401 });
    }

    const business = await getBusinessById(dbCtx.activeBusinessId);
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const ctx = dbCtx;

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
