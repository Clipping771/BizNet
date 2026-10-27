/**
 * lib/compare/priority.ts
 *
 * Deterministic Priority Scoring & Best Fit Engine (§8.8 A2, E2)
 * Pure function: calculateQuotePriorityScores, determineBestFit
 *
 * Rules:
 * Computed only over quotes with status SUBMITTED/REVISED and validUntil >= now.
 *
 * priceScore = 1 if maxTotal = minTotal, else (maxTotal − total) / (maxTotal − minTotal).
 * speedScore = 1 if maxDays = minDays, else (maxDays − deliveryDays) / (maxDays − minDays).
 * termScore = 1 if paymentTerm = buyer's preferredPaymentTerm;
 *             else 0.5 if both are credit terms or both are non-credit;
 *             else 0.
 *             If buyer has no preference:
 *             CREDIT_30 = 1, CREDIT_15 = 0.8, CREDIT_7 = 0.6, CASH_ON_DELIVERY = 0.4, ADVANCE = 0.2, OTHER = 0.3.
 * specScore = (comparable fields with MATCH) ÷ (comparable fields in the request); 1 if none.
 * late = neededBy set and (today in Asia/Dhaka + deliveryDays) > neededBy.
 *
 * Weights (price, speed, term, spec):
 * - PRICE:         0.6  / 0.1  / 0.1  / 0.2
 * - SPEED:         0.1  / 0.6  / 0.1  / 0.2
 * - PAYMENT_TERMS: 0.2  / 0.1  / 0.5  / 0.2
 * - BALANCED:      0.35 / 0.25 / 0.2  / 0.2
 *
 * score = weighted sum × 100, rounded to 2 dp.
 * Late penalty:
 * - If late, multiply by 0.5 for PRICE and PAYMENT_TERMS;
 * - For SPEED and BALANCED, a late quote is INELIGIBLE for best fit (score kept for display, flagged).
 *
 * Tie-break:
 * higher score → not late → lower total → fewer delivery days → higher specScore → earlier createdAt → smaller quote id.
 */

import { PaymentTerm, Priority, QuoteStatus } from "@prisma/client";
import { getDhakaDateString } from "@/lib/dates";

/** Calendar day in Asia/Dhaka as a UTC-midnight Date, so day arithmetic ignores time of day. */
function dhakaDay(date: Date): Date {
  return new Date(`${getDhakaDateString(date)}T00:00:00.000Z`);
}

export interface QuoteComparisonInput {
  id: string;
  quoteRef?: string; // Anonymized Q1, Q2, etc.
  totalPrice: number;
  deliveryDays: number;
  paymentTerm: PaymentTerm;
  validUntil: Date;
  status: QuoteStatus;
  createdAt: Date;
  specMatch: Record<string, "MATCH" | "DIFFERENT" | "NOT_STATED" | string>;
}

export interface RequestComparisonContext {
  neededBy?: Date | null;
  preferredPaymentTerm?: PaymentTerm | null;
  priority: Priority;
  comparableFieldKeys: string[]; // List of attribute keys that are compared
  todayDhaka: Date; // Today's date in Asia/Dhaka
}

export interface ScoredQuote {
  id: string;
  quoteRef: string;
  totalPrice: number;
  deliveryDays: number;
  paymentTerm: PaymentTerm;
  validUntil: Date;
  status: QuoteStatus;
  createdAt: Date;
  isLate: boolean;
  estimatedArrival: Date;
  priceScore: number;
  speedScore: number;
  termScore: number;
  specScore: number;
  rawScore: number;
  finalScore: number;
  eligibleForBestFit: boolean;
  tags: string[];
}

export interface ComparisonEvaluationResult {
  quotes: ScoredQuote[];
  serverBestFitId: string | null;
  serverBestFitQuoteRef: string | null;
  lowestTotal: number | null;
  minDeliveryDays: number | null;
}

const CREDIT_TERMS = new Set<PaymentTerm>([
  PaymentTerm.CREDIT_7,
  PaymentTerm.CREDIT_15,
  PaymentTerm.CREDIT_30,
]);

const DEFAULT_TERM_SCORES: Record<PaymentTerm, number> = {
  CREDIT_30: 1.0,
  CREDIT_15: 0.8,
  CREDIT_7: 0.6,
  CASH_ON_DELIVERY: 0.4,
  ADVANCE: 0.2,
  OTHER: 0.3,
};

const WEIGHTS: Record<Priority, { price: number; speed: number; term: number; spec: number }> = {
  PRICE: { price: 0.6, speed: 0.1, term: 0.1, spec: 0.2 },
  SPEED: { price: 0.1, speed: 0.6, term: 0.1, spec: 0.2 },
  PAYMENT_TERMS: { price: 0.2, speed: 0.1, term: 0.5, spec: 0.2 },
  BALANCED: { price: 0.35, speed: 0.25, term: 0.2, spec: 0.2 },
};

/**
 * Pure function: calculates priority score, arrival date, spec score, late penalty, and tags
 * according to §8.8 A2.
 */
export function evaluateQuotePriorities(
  quotes: QuoteComparisonInput[],
  context: RequestComparisonContext,
  now: Date
): ComparisonEvaluationResult {
  // Filter active quotes: status SUBMITTED or REVISED and validUntil >= now
  const activeQuotes = quotes.filter(
    (q) =>
      (q.status === QuoteStatus.SUBMITTED || q.status === QuoteStatus.REVISED) &&
      q.validUntil.getTime() >= now.getTime()
  );

  if (activeQuotes.length === 0) {
    return {
      quotes: [],
      serverBestFitId: null,
      serverBestFitQuoteRef: null,
      lowestTotal: null,
      minDeliveryDays: null,
    };
  }

  // Find bounds across active quotes
  let minTotal = Infinity;
  let maxTotal = -Infinity;
  let minDays = Infinity;
  let maxDays = -Infinity;

  for (const q of activeQuotes) {
    if (q.totalPrice < minTotal) minTotal = q.totalPrice;
    if (q.totalPrice > maxTotal) maxTotal = q.totalPrice;
    if (q.deliveryDays < minDays) minDays = q.deliveryDays;
    if (q.deliveryDays > maxDays) maxDays = q.deliveryDays;
  }

  const weights = WEIGHTS[context.priority] || WEIGHTS.BALANCED;
  const comparableCount = context.comparableFieldKeys.length;

  const scoredQuotes: ScoredQuote[] = activeQuotes.map((q, idx) => {
    const quoteRef = q.quoteRef || `Q${idx + 1}`;

    // 1. priceScore
    const priceScore =
      maxTotal === minTotal ? 1 : (maxTotal - q.totalPrice) / (maxTotal - minTotal);

    // 2. speedScore
    const speedScore =
      maxDays === minDays ? 1 : (maxDays - q.deliveryDays) / (maxDays - minDays);

    // 3. termScore
    let termScore = 0;
    if (context.preferredPaymentTerm) {
      if (q.paymentTerm === context.preferredPaymentTerm) {
        termScore = 1;
      } else {
        const qIsCredit = CREDIT_TERMS.has(q.paymentTerm);
        const prefIsCredit = CREDIT_TERMS.has(context.preferredPaymentTerm);
        if (qIsCredit === prefIsCredit) {
          termScore = 0.5;
        } else {
          termScore = 0;
        }
      }
    } else {
      termScore = DEFAULT_TERM_SCORES[q.paymentTerm] ?? 0.3;
    }

    // 4. specScore
    let matchedFields = 0;
    if (comparableCount > 0) {
      for (const field of context.comparableFieldKeys) {
        if (q.specMatch?.[field] === "MATCH") {
          matchedFields++;
        }
      }
    }
    const specScore = comparableCount === 0 ? 1 : matchedFields / comparableCount;

    // 5. Late calculation:
    // estimatedArrival = todayDhaka + deliveryDays
    // Compared as Dhaka calendar days: arriving on the needed-by day is on time.
    const estimatedArrival = dhakaDay(context.todayDhaka);
    estimatedArrival.setUTCDate(estimatedArrival.getUTCDate() + q.deliveryDays);

    let isLate = false;
    if (context.neededBy) {
      isLate = estimatedArrival.getTime() > dhakaDay(new Date(context.neededBy)).getTime();
    }

    // Weighted sum
    const rawWeighted =
      weights.price * priceScore +
      weights.speed * speedScore +
      weights.term * termScore +
      weights.spec * specScore;

    let finalScore = Math.round(rawWeighted * 100 * 100) / 100;
    let eligibleForBestFit = true;

    // Late penalty:
    if (isLate) {
      if (context.priority === Priority.PRICE || context.priority === Priority.PAYMENT_TERMS) {
        finalScore = Math.round(finalScore * 0.5 * 100) / 100;
      } else {
        // For SPEED and BALANCED: late quote is ineligible for best fit
        eligibleForBestFit = false;
      }
    }

    // Tags computed by code (§8.8 A):
    // "Lowest total", "Fastest", "Matches all specs".
    // "A quote arriving after neededBy never gets 'best' tags."
    const tags: string[] = [];
    if (!isLate) {
      if (q.totalPrice === minTotal) {
        tags.push("LOWEST_TOTAL");
      }
      if (q.deliveryDays === minDays) {
        tags.push("FASTEST");
      }
      if (specScore === 1) {
        tags.push("MATCHES_ALL_SPECS");
      }
    }

    return {
      id: q.id,
      quoteRef,
      totalPrice: q.totalPrice,
      deliveryDays: q.deliveryDays,
      paymentTerm: q.paymentTerm,
      validUntil: q.validUntil,
      status: q.status,
      createdAt: q.createdAt,
      isLate,
      estimatedArrival,
      priceScore,
      speedScore,
      termScore,
      specScore,
      rawScore: Math.round(rawWeighted * 100 * 100) / 100,
      finalScore,
      eligibleForBestFit,
      tags,
    };
  });

  // Sort candidates for Server Best Fit:
  // Tie-break: higher score → not late → lower total → fewer delivery days → higher specScore → earlier createdAt → smaller quote id.
  const sorted = [...scoredQuotes].sort((a, b) => {
    // 1. Higher finalScore
    if (b.finalScore !== a.finalScore) {
      return b.finalScore - a.finalScore;
    }
    // 2. Not late before late
    if (a.isLate !== b.isLate) {
      return a.isLate ? 1 : -1;
    }
    // 3. Lower total
    if (a.totalPrice !== b.totalPrice) {
      return a.totalPrice - b.totalPrice;
    }
    // 4. Fewer delivery days
    if (a.deliveryDays !== b.deliveryDays) {
      return a.deliveryDays - b.deliveryDays;
    }
    // 5. Higher specScore
    if (b.specScore !== a.specScore) {
      return b.specScore - a.specScore;
    }
    // 6. Earlier createdAt
    if (a.createdAt.getTime() !== b.createdAt.getTime()) {
      return a.createdAt.getTime() - b.createdAt.getTime();
    }
    // 7. Smaller quote id
    return a.id.localeCompare(b.id);
  });

  // Pick top eligible quote for best fit
  const bestFit = sorted.find((q) => q.eligibleForBestFit) || null;

  return {
    quotes: sorted,
    serverBestFitId: bestFit ? bestFit.id : null,
    serverBestFitQuoteRef: bestFit ? bestFit.quoteRef : null,
    lowestTotal: minTotal === Infinity ? null : minTotal,
    minDeliveryDays: minDays === Infinity ? null : minDays,
  };
}
