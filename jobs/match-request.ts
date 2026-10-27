/**
 * jobs/match-request.ts
 *
 * Matching job for procurement requests (§8.6, F8).
 */

import { prisma } from "@/lib/prisma";
import { VerificationStatus, RequestStatus, PlatformRole } from "@prisma/client";
import {
  rankEligibleSuppliers,
  haversineDistanceKm,
  DHAKA_AREA_COORDINATES,
  type SupplierMatchInput,
} from "@/lib/matching/score";
import { getSetting } from "@/lib/settings";
import { getSmsProvider } from "@/lib/sms/provider";
import { logAudit } from "@/lib/audit";

export interface MatchRequestJobResult {
  requestId: string;
  eligibleCount: number;
  invitedCount: number;
  zeroMatchFlagged: boolean;
}

export async function runMatchRequestJob(
  requestId: string,
  now: Date = new Date()
): Promise<MatchRequestJobResult> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: {
      category: true,
      buyerBusiness: true,
    },
  });

  if (!request) {
    throw new Error(`Request not found: ${requestId}`);
  }

  const matchingRadiusKm = (await getSetting("matchingRadiusKm")) || 25;
  const maxInvitesPerRequest = (await getSetting("maxInvitesPerRequest")) || 15;
  const reliabilityMinFeedbacks = (await getSetting("reliabilityMinFeedbacks")) || 3;

  // 1. Query potential suppliers
  // Must be: isSupplier, not suspended, BASIC or VERIFIED, not buyer's own business
  const potentialSuppliers = await prisma.business.findMany({
    where: {
      isSupplier: true,
      isSuspended: false,
      deletedAt: null,
      id: { not: request.buyerBusinessId },
      verificationStatus: { in: [VerificationStatus.BASIC, VerificationStatus.VERIFIED] },
      OR: [
        {
          listings: {
            some: {
              categoryId: request.categoryId,
              isActive: true,
              deletedAt: null,
            },
          },
        },
        {
          supplierCategories: {
            some: {
              categoryId: request.categoryId,
            },
          },
        },
      ],
    },
    include: {
      listings: {
        where: {
          categoryId: request.categoryId,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      },
      members: {
        include: { user: true },
      },
    },
  });

  // Resolve request coordinates
  let reqLat: number | null = null;
  let reqLng: number | null = null;
  if (DHAKA_AREA_COORDINATES[request.deliveryArea]) {
    reqLat = DHAKA_AREA_COORDINATES[request.deliveryArea].lat;
    reqLng = DHAKA_AREA_COORDINATES[request.deliveryArea].lng;
  }

  const normalizedDeliveryArea = request.deliveryArea.trim().toLowerCase();

  // 2. Filter by area match or Haversine distance
  let eligibleSuppliers = potentialSuppliers.filter((s) => {
    // If directSupplierId is set, ONLY invite that supplier (§8.6, C4)
    if (request.directSupplierId && s.id !== request.directSupplierId) {
      return false;
    }

    // Delivery area inclusion
    const inDeliveryAreas = s.deliveryAreas.some(
      (area) => area.trim().toLowerCase() === normalizedDeliveryArea
    );
    if (inDeliveryAreas) return true;

    // Haversine distance check
    let sLat = s.lat;
    let sLng = s.lng;
    if (sLat === null && DHAKA_AREA_COORDINATES[s.area]) {
      sLat = DHAKA_AREA_COORDINATES[s.area].lat;
      sLng = DHAKA_AREA_COORDINATES[s.area].lng;
    }

    if (sLat !== null && sLng !== null && reqLat !== null && reqLng !== null) {
      const dist = haversineDistanceKm(sLat, sLng, reqLat, reqLng);
      return dist <= matchingRadiusKm;
    }

    return false;
  });

  // 3. Handle 0 eligible suppliers (§8.6, C4)
  if (eligibleSuppliers.length === 0) {
    // Flag in admin concierge queue
    await prisma.report.create({
      data: {
        reporterUserId: request.createdByUserId,
        targetType: "REQUEST_ZERO_MATCH",
        targetId: request.id,
        reason: "NO_ELIGIBLE_SUPPLIERS",
        details: `Request ${request.code} in category ${request.category.slug} for area ${request.deliveryArea} has 0 matching eligible suppliers. Needs Concierge intervention.`,
      },
    });

    await logAudit({
      actorUserId: request.createdByUserId,
      actorBusinessId: request.buyerBusinessId,
      action: "MATCH_ZERO_ELIGIBLE",
      entityType: "REQUEST",
      entityId: request.id,
      after: { code: request.code, categorySlug: request.category.slug },
    });

    return {
      requestId: request.id,
      eligibleCount: 0,
      invitedCount: 0,
      zeroMatchFlagged: true,
    };
  }

  // 4. Gather supplier stats for scoring relative to `now`
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const supplierInputs: SupplierMatchInput[] = [];

  for (const s of eligibleSuppliers) {
    // Invites in last 60 days
    const invites = await prisma.requestInvite.findMany({
      where: {
        supplierBusinessId: s.id,
        notifiedAt: { gte: sixtyDaysAgo },
      },
      include: {
        request: { select: { status: true } },
      },
    });

    const openInvitesCount = invites.filter((inv) => inv.request.status === RequestStatus.OPEN).length;

    // Quotes in last 60 days
    const quotesLast60 = await prisma.quote.count({
      where: {
        supplierBusinessId: s.id,
        createdAt: { gte: sixtyDaysAgo },
      },
    });

    // Feedbacks in last 180 days
    const feedbacks = await prisma.reliabilityFeedback.findMany({
      where: {
        order: { supplierBusinessId: s.id },
        createdAt: { gte: oneEightyDaysAgo },
      },
      select: {
        onTime: true,
        quantityCorrect: true,
        matchedSpec: true,
      },
    });

    // Quotes in last 14 days
    const recentQuotes = await prisma.quote.count({
      where: {
        supplierBusinessId: s.id,
        createdAt: { gte: fourteenDaysAgo },
      },
    });

    supplierInputs.push({
      id: s.id,
      verificationStatus: s.verificationStatus,
      verifiedAt: s.verifiedAt,
      createdAt: s.createdAt,
      deliveryAreas: s.deliveryAreas,
      lat: s.lat,
      lng: s.lng,
      hasCategoryListing: s.listings.length > 0,
      invitesLast60Days: invites.length,
      quotesFromInvitesLast60Days: quotesLast60,
      openInvitesLast60Days: openInvitesCount,
      feedbacksLast180Days: feedbacks,
      hasQuotedLast14Days: recentQuotes > 0,
    });
  }

  // 5. Rank suppliers
  const ranked = rankEligibleSuppliers(
    supplierInputs,
    {
      deliveryArea: request.deliveryArea,
      lat: reqLat,
      lng: reqLng,
    },
    {
      now,
      matchingRadiusKm,
      reliabilityMinFeedbacks,
    }
  );

  // 6. Invite top N
  const topInvites = ranked.slice(0, maxInvitesPerRequest);
  const smsProvider = getSmsProvider();

  for (const item of topInvites) {
    const supplierBiz = eligibleSuppliers.find((s) => s.id === item.supplierId);
    if (!supplierBiz) continue;

    // Upsert RequestInvite record
    await prisma.requestInvite.upsert({
      where: {
        requestId_supplierBusinessId: {
          requestId: request.id,
          supplierBusinessId: item.supplierId,
        },
      },
      update: {
        rank: item.rank,
        score: item.score,
        reasons: item.reasons,
        notifiedAt: now,
      },
      create: {
        requestId: request.id,
        supplierBusinessId: item.supplierId,
        rank: item.rank,
        score: item.score,
        reasons: item.reasons,
        notifiedAt: now,
      },
    });

    // Create Conversation between (request, buyer, supplier) if not exists (§8.12, I1)
    await prisma.conversation.upsert({
      where: {
        requestId_supplierBusinessId: {
          requestId: request.id,
          supplierBusinessId: item.supplierId,
        },
      },
      update: {},
      create: {
        requestId: request.id,
        buyerBusinessId: request.buyerBusinessId,
        supplierBusinessId: item.supplierId,
        lastMessageAt: now,
      },
    });

    // Notify supplier members in-app and send SMS
    for (const member of supplierBiz.members) {
      await prisma.notification.create({
        data: {
          userId: member.userId,
          type: "REQUEST_INVITE",
          params: {
            requestId: request.id,
            requestCode: request.code,
            title: request.title,
            rank: item.rank,
            score: item.score,
          },
          link: `/requests/${request.code}`,
        },
      });

      if (member.user.phone) {
        await smsProvider.sendSms(
          member.user.phone,
          `BizNet: নতুন কোটেশন অনুরোধ "${request.title}"। কোড: ${request.code}। দেখার জন্য অ্যাপে যান।`
        );
      }
    }
  }

  return {
    requestId: request.id,
    eligibleCount: eligibleSuppliers.length,
    invitedCount: topInvites.length,
    zeroMatchFlagged: false,
  };
}
