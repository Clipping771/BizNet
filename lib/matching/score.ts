/**
 * lib/matching/score.ts
 *
 * Deterministic Matching Score (§8.6, F8, C2)
 * Pure function: calculateMatchingScore, rankSuppliers
 *
 * Ranking formula:
 * - verifiedPts = 30 if VERIFIED, 15 if BASIC.
 * - listingPts = 25 if the supplier has an active listing in the request's category, else 0 (declared-category-only suppliers are still eligible).
 * - distancePts = 15 if the request area is in deliveryAreas;
 *                 else if both have coordinates: round(15 × max(0, 1 − distanceKm / matchingRadiusKm));
 *                 else 0.
 * - responsePts = round(15 × r) where r = (requests invited in the last 60 days that the supplier quoted on) ÷
 *                 (requests invited in the last 60 days, excluding requests still OPEN).
 *                 If fewer than 5 such invites, r = 0.5 (neutral).
 * - reliabilityPts = round(10 × f) where f = mean over feedbacks of (onTime, quantityCorrect, matchedSpec as 1/0, nulls ignored)
 *                    in the last 180 days.
 *                    If fewer than reliabilityMinFeedbacks (default 3) feedbacks, f = 0.5 (neutral).
 * - recencyPts = 5 if the supplier quoted on any request in the last 14 days, else 0.
 *
 * score = sum (0–100).
 * All windows computed from the job's start time (now passed in, never read inside).
 *
 * Tie-break order:
 * higher score → VERIFIED before BASIC → earlier verifiedAt → lexicographically smaller business id.
 */

export interface SupplierMatchInput {
  id: string;
  verificationStatus: "UNVERIFIED" | "PENDING" | "BASIC" | "VERIFIED" | "REJECTED" | "SUSPENDED" | string;
  verifiedAt?: Date | null;
  createdAt: Date;
  deliveryAreas: string[];
  lat?: number | null;
  lng?: number | null;
  hasCategoryListing: boolean;
  // Stats calculated relative to `now` passed into the function:
  invitesLast60Days: number;
  quotesFromInvitesLast60Days: number;
  openInvitesLast60Days?: number;
  feedbacksLast180Days: Array<{
    onTime?: boolean | null;
    quantityCorrect?: boolean | null;
    matchedSpec?: boolean | null;
  }>;
  hasQuotedLast14Days: boolean;
}

export interface RequestMatchInput {
  deliveryArea: string;
  lat?: number | null;
  lng?: number | null;
}

export interface MatchingOptions {
  matchingRadiusKm?: number;
  reliabilityMinFeedbacks?: number;
  now: Date;
}

export interface SupplierScoreBreakdown {
  verifiedPts: number;
  listingPts: number;
  distancePts: number;
  responsePts: number;
  reliabilityPts: number;
  recencyPts: number;
  totalScore: number;
  reasons: string[];
}

export interface RankedSupplierMatch {
  supplierId: string;
  score: number;
  rank: number;
  reasons: string[];
  breakdown: SupplierScoreBreakdown;
  supplier: SupplierMatchInput;
}

/**
 * Standard approximate coordinates for major commercial zones in Dhaka.
 */
export const DHAKA_AREA_COORDINATES: Record<string, { lat: number; lng: number }> = {
  Mirpur: { lat: 23.8041, lng: 90.3667 },
  Dhanmondi: { lat: 23.7461, lng: 90.3742 },
  Mohammadpur: { lat: 23.7658, lng: 90.3583 },
  Uttara: { lat: 23.8759, lng: 90.3795 },
  Gulshan: { lat: 23.7925, lng: 90.4078 },
  Chawkbazar: { lat: 23.7171, lng: 90.3957 },
  Motijheel: { lat: 23.733, lng: 90.4172 },
  Banani: { lat: 23.7937, lng: 90.4066 },
  Tejgaon: { lat: 23.7644, lng: 90.3934 },
  Badda: { lat: 23.7805, lng: 90.4267 },
  OldDhaka: { lat: 23.7104, lng: 90.4074 },
};

/**
 * Calculates Great-Circle distance in kilometres between two coordinates.
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Pure function: calculates the matching score breakdown for one supplier.
 */
export function calculateSupplierScore(
  supplier: SupplierMatchInput,
  request: RequestMatchInput,
  options: MatchingOptions
): SupplierScoreBreakdown {
  const matchingRadiusKm = options.matchingRadiusKm ?? 25;
  const reliabilityMinFeedbacks = options.reliabilityMinFeedbacks ?? 3;

  // 1. Verification points: 30 if VERIFIED, 15 if BASIC, 0 otherwise
  let verifiedPts = 0;
  if (supplier.verificationStatus === "VERIFIED") {
    verifiedPts = 30;
  } else if (supplier.verificationStatus === "BASIC") {
    verifiedPts = 15;
  }

  // 2. Listing points: 25 if active listing in request's category, else 0
  const listingPts = supplier.hasCategoryListing ? 25 : 0;

  // 3. Distance points:
  // 15 if request area is in deliveryAreas;
  // else if both have coordinates: round(15 × max(0, 1 − distanceKm / matchingRadiusKm));
  // else 0.
  let distancePts = 0;
  const normalizedReqArea = request.deliveryArea.trim().toLowerCase();
  const hasAreaInDeliveryAreas = supplier.deliveryAreas.some(
    (a) => a.trim().toLowerCase() === normalizedReqArea
  );

  if (hasAreaInDeliveryAreas) {
    distancePts = 15;
  } else {
    // Resolve supplier coords
    let sLat = supplier.lat ?? null;
    let sLng = supplier.lng ?? null;
    // Resolve request coords
    let rLat = request.lat ?? null;
    let rLng = request.lng ?? null;

    if (rLat === null && DHAKA_AREA_COORDINATES[request.deliveryArea]) {
      rLat = DHAKA_AREA_COORDINATES[request.deliveryArea].lat;
      rLng = DHAKA_AREA_COORDINATES[request.deliveryArea].lng;
    }

    if (sLat !== null && sLng !== null && rLat !== null && rLng !== null) {
      const distance = haversineDistanceKm(sLat, sLng, rLat, rLng);
      const ratio = Math.max(0, 1 - distance / matchingRadiusKm);
      distancePts = Math.round(15 * ratio);
    }
  }

  // 4. Response rate points:
  // r = (requests invited in last 60 days supplier quoted on) /
  //     (requests invited in last 60 days excluding requests still OPEN)
  // If fewer than 5 such invites, r = 0.5 (neutral)
  const openInvites = supplier.openInvitesLast60Days ?? 0;
  const eligibleInvites = supplier.invitesLast60Days - openInvites;

  let r = 0.5;
  if (eligibleInvites >= 5) {
    r = Math.min(1, Math.max(0, supplier.quotesFromInvitesLast60Days / eligibleInvites));
  }
  const responsePts = Math.round(15 * r);

  // 5. Reliability points:
  // f = mean over feedbacks of (onTime, quantityCorrect, matchedSpec as 1/0, nulls ignored) in last 180 days.
  // If fewer than reliabilityMinFeedbacks feedbacks, f = 0.5 (neutral)
  let f = 0.5;
  const feedbacks = supplier.feedbacksLast180Days || [];
  if (feedbacks.length >= reliabilityMinFeedbacks) {
    let sum = 0;
    let count = 0;
    for (const fb of feedbacks) {
      if (fb.onTime !== null && fb.onTime !== undefined) {
        sum += fb.onTime ? 1 : 0;
        count++;
      }
      if (fb.quantityCorrect !== null && fb.quantityCorrect !== undefined) {
        sum += fb.quantityCorrect ? 1 : 0;
        count++;
      }
      if (fb.matchedSpec !== null && fb.matchedSpec !== undefined) {
        sum += fb.matchedSpec ? 1 : 0;
        count++;
      }
    }
    f = count > 0 ? sum / count : 0.5;
  }
  const reliabilityPts = Math.round(10 * f);

  // 6. Recency points: 5 if supplier quoted on any request in last 14 days, else 0
  const recencyPts = supplier.hasQuotedLast14Days ? 5 : 0;

  const totalScore = verifiedPts + listingPts + distancePts + responsePts + reliabilityPts + recencyPts;

  // Build human-readable reason codes for each non-zero component
  const reasons: string[] = [];
  if (verifiedPts > 0) reasons.push("VERIFIED_STATUS");
  if (listingPts > 0) reasons.push("CATEGORY_LISTING");
  if (distancePts > 0) reasons.push("DELIVERY_AREA_MATCH");
  if (responsePts > 0) reasons.push("HIGH_RESPONSE_RATE");
  if (reliabilityPts > 0) reasons.push("HIGH_RELIABILITY");
  if (recencyPts > 0) reasons.push("RECENT_QUOTER");

  return {
    verifiedPts,
    listingPts,
    distancePts,
    responsePts,
    reliabilityPts,
    recencyPts,
    totalScore,
    reasons,
  };
}

/**
 * Pure function: ranks a list of eligible suppliers according to §8.6 tie-break rules.
 *
 * Tie-break order:
 * 1. Higher total score
 * 2. VERIFIED before BASIC
 * 3. Earlier verifiedAt date
 * 4. Lexicographically smaller business id
 */
export function rankEligibleSuppliers(
  suppliers: SupplierMatchInput[],
  request: RequestMatchInput,
  options: MatchingOptions
): RankedSupplierMatch[] {
  const scored = suppliers.map((supplier) => {
    const breakdown = calculateSupplierScore(supplier, request, options);
    return {
      supplierId: supplier.id,
      score: breakdown.totalScore,
      rank: 0, // Assigned after sorting
      reasons: breakdown.reasons,
      breakdown,
      supplier,
    };
  });

  scored.sort((a, b) => {
    // 1. Higher total score
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    // 2. VERIFIED before BASIC
    const aIsVerified = a.supplier.verificationStatus === "VERIFIED" ? 1 : 0;
    const bIsVerified = b.supplier.verificationStatus === "VERIFIED" ? 1 : 0;
    if (bIsVerified !== aIsVerified) {
      return bIsVerified - aIsVerified;
    }

    // 3. Earlier verifiedAt
    const aVerifiedAt = a.supplier.verifiedAt ? a.supplier.verifiedAt.getTime() : Infinity;
    const bVerifiedAt = b.supplier.verifiedAt ? b.supplier.verifiedAt.getTime() : Infinity;
    if (aVerifiedAt !== bVerifiedAt) {
      return aVerifiedAt - bVerifiedAt;
    }

    // 4. Lexicographically smaller business id
    return a.supplierId.localeCompare(b.supplierId);
  });

  // Assign 1-indexed rank
  return scored.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}
