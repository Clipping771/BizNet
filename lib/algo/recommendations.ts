/**
 * lib/algo/recommendations.ts
 *
 * Algorithmic Recommendation & Retargeting Engine
 *
 * Computes multi-factor personalized scores for active product listings:
 * Score = S_interest * S_locality * S_trust * S_freshness * S_retarget
 */

import { fetchRecommendationCandidates } from "@/lib/repo/algo";
import { getBuyerInterestProfile, BuyerInterestProfile } from "./buyerProfile";

export interface RecommendedListing {
  id: string;
  title: string;
  unit: string;
  priceMin: string | number | null;
  priceMax: string | number | null;
  currency: string;
  moq: number | null;
  leadTimeDays: number | null;
  imageKeys: string[];
  createdAt: Date;
  category: { slug: string };
  business: {
    id: string;
    name: string;
    slug: string;
    businessType: string;
    area: string;
    city: string;
    verificationStatus: string;
  };
  score: number;
  reasonKey: string;
  reasonParam?: string;
}

export interface RecommendationOptions {
  userId?: string | null;
  businessId?: string | null;
  buyerArea?: string | null;
  buyerCity?: string | null;
  take?: number;
  excludeListingIds?: string[];
  categorySlug?: string | null;
  now?: Date;
}

export async function getPersonalizedRecommendations(
  options: RecommendationOptions
): Promise<RecommendedListing[]> {
  const {
    userId,
    businessId,
    buyerArea,
    buyerCity,
    take = 6,
    excludeListingIds = [],
    categorySlug,
    now = new Date(),
  } = options;

  // 1. Compute dynamic interest profile
  const profile: BuyerInterestProfile = await getBuyerInterestProfile({
    userId,
    businessId,
    now,
  });

  const excludedIds = new Set<string>([
    ...excludeListingIds,
    ...profile.dismissedListingIds,
  ]);

  // 2. Fetch candidate listings from verified/basic suppliers
  const whereClause: Record<string, any> = {
    isActive: true,
    deletedAt: null,
    business: {
      isSuspended: false,
      deletedAt: null,
      isSupplier: true,
      verificationStatus: { in: ["BASIC", "VERIFIED"] },
      ...(businessId ? { id: { not: businessId } } : {}),
    },
    ...(excludedIds.size > 0 ? { id: { notIn: Array.from(excludedIds) } } : {}),
  };

  if (categorySlug) {
    whereClause.category = { slug: categorySlug };
  } else if (profile.dismissedCategories.length > 0) {
    whereClause.category = { slug: { notIn: Array.from(profile.dismissedCategories) } };
  }

  const candidates = await fetchRecommendationCandidates(whereClause);

  if (candidates.length === 0) return [];

  // 3. Multi-Factor Scoring
  const maxCategoryScore = Math.max(1, ...Object.values(profile.categoryScores));

  const scored: RecommendedListing[] = candidates.map((item) => {
    let score = 1.0;
    let reasonKey = "algo.reason.trending";
    let reasonParam: string | undefined = undefined;

    const cat = item.category.slug;
    const catAffinity = profile.categoryScores[cat] || 0;

    // A. Interest Similarity (0.5 to 3.0)
    if (catAffinity > 0) {
      const normalizedAffinity = catAffinity / maxCategoryScore;
      score *= 1.0 + normalizedAffinity * 2.0;
      reasonKey = "algo.reason.interest";
      reasonParam = cat;
    }

    // B. Retargeting Boost: viewed products in this category (1.5x)
    if (profile.viewedListingIds.includes(item.id)) {
      score *= 0.8; // slightly reduce if already viewed the exact same listing to promote discovery
    } else if (profile.topCategories.length > 0 && profile.topCategories[0] === cat) {
      score *= 1.4;
      reasonKey = "algo.reason.viewed";
    }

    // C. Search Term Match
    if (profile.recentSearchTerms.length > 0) {
      const titleLower = item.title.toLowerCase();
      const matchedTerm = profile.recentSearchTerms.find((t) => titleLower.includes(t));
      if (matchedTerm) {
        score *= 1.5;
        reasonKey = "algo.reason.search";
      }
    }

    // D. Geographic Locality Boost
    if (buyerArea && item.business.deliveryAreas.includes(buyerArea)) {
      score *= 1.35;
      if (reasonKey === "algo.reason.trending") {
        reasonKey = "algo.reason.nearby";
        reasonParam = buyerArea;
      }
    } else if (buyerCity && item.business.city?.toLowerCase() === buyerCity.toLowerCase()) {
      score *= 1.15;
    }

    // E. Supplier Trust Boost
    if (item.business.verificationStatus === "VERIFIED") {
      score *= 1.3;
    } else if (item.business.verificationStatus === "BASIC") {
      score *= 1.1;
    }

    // F. Listing Freshness Boost
    const daysSinceCreated = Math.max(0, (now.getTime() - item.createdAt.getTime()) / (86400 * 1000));
    if (daysSinceCreated <= 7) {
      score *= 1.25;
    } else if (daysSinceCreated <= 30) {
      score *= 1.1;
    }

    // G. Price Transparency Boost
    if (item.priceMin !== null) {
      score *= 1.15;
    }

    return {
      id: item.id,
      title: item.title,
      unit: item.unit,
      priceMin: item.priceMin ? Number(item.priceMin) : null,
      priceMax: item.priceMax ? Number(item.priceMax) : null,
      currency: item.currency,
      moq: item.moq,
      leadTimeDays: item.leadTimeDays,
      imageKeys: Array.isArray(item.imageKeys) ? (item.imageKeys as string[]) : [],
      createdAt: item.createdAt,
      category: item.category,
      business: {
        id: item.business.id,
        name: item.business.name,
        slug: item.business.slug,
        businessType: item.business.businessType,
        area: item.business.area,
        city: item.business.city,
        verificationStatus: item.business.verificationStatus,
      },
      score,
      reasonKey,
      reasonParam,
    };
  });

  // 4. Sort by score descending and return top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, take);
}
