import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { getBusinessById } from "@/lib/repo/business";
import {
  submitVerificationRequest,
  getLatestVerificationForBusiness,
  VerificationError,
} from "@/lib/repo/verification";
import { PlatformRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.isLoggedIn || !session.userId || !session.activeBusinessId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const business = await getBusinessById(session.activeBusinessId);
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const latest = await getLatestVerificationForBusiness(business.id);

    return NextResponse.json({
      business: {
        id: business.id,
        name: business.name,
        verificationStatus: business.verificationStatus,
        isSuspended: business.isSuspended,
      },
      latestRequest: latest,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load verification" }, { status: 500 });
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

    const ctx = {
      userId: session.userId,
      role: session.role || PlatformRole.USER,
      activeBusinessId: session.activeBusinessId,
      businessRole: session.businessRole || null,
    };

    assertCan(ctx, "business:verification_request", {
      businessId: business.id,
      isSuspended: business.isSuspended,
    });

    const body = await req.json();
    const { tradeLicenseNo, documentKeys, referenceName, referencePhone } = body;

    const request = await submitVerificationRequest({
      businessId: business.id,
      userId: session.userId,
      tradeLicenseNo,
      documentKeys: Array.isArray(documentKeys) ? documentKeys : [],
      referenceName,
      referencePhone,
    });

    return NextResponse.json({ success: true, request });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof VerificationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || "Failed to submit verification" }, { status: 500 });
  }
}
