/**
 * lib/algo/config.ts
 *
 * Algorithmic parameters for Behavioral Signals, Exponential Time Decay,
 * Sigmoid Cold-Start Blending, and Multi-Factor Ranking.
 */

export type DecayTier = "SLOW" | "MEDIUM" | "FAST" | "DEAL_TERMINATION";

export interface SignalDefinition {
  weight: number;
  decayTier: DecayTier;
  lambda: number; // Daily exponential decay constant: e^(-lambda * delta_days)
}

/**
 * Signal-to-Decay Mapping & Weights:
 * Reflects longer B2B purchase cycles with appropriate half-lives.
 * - SLOW: lambda = 0.05 (Half-life ~ 14 days)
 * - MEDIUM: lambda = 0.15 (Half-life ~ 4.6 days)
 * - FAST: lambda = 0.40 (Half-life ~ 1.7 days)
 * - DEAL_TERMINATION: Explicit deal termination logic (lambda = 0, handled via active filter)
 */
export const SIGNAL_CONFIG = {
  RFQ_CREATED: {
    weight: 10.0,
    decayTier: "SLOW" as DecayTier,
    lambda: 0.05,
  },
  DIRECT_CONTACT: {
    weight: 8.0,
    decayTier: "SLOW" as DecayTier,
    lambda: 0.05,
  },
  REPEAT_LISTING_VIEW: {
    weight: 5.0,
    decayTier: "MEDIUM" as DecayTier,
    lambda: 0.15,
  },
  SEARCH_QUERY: {
    weight: 3.0,
    decayTier: "MEDIUM" as DecayTier,
    lambda: 0.15,
  },
  LISTING_DWELL: {
    weight: 2.0,
    decayTier: "FAST" as DecayTier,
    lambda: 0.40,
  },
  CATEGORY_BROWSE: {
    weight: 1.0,
    decayTier: "FAST" as DecayTier,
    lambda: 0.40,
  },
  DISMISS_RECOMMENDATION: {
    weight: -8.0,
    decayTier: "SLOW" as DecayTier,
    lambda: 0.05,
  },
  DEAL_COMPLETED: {
    weight: 0.0,
    decayTier: "DEAL_TERMINATION" as DecayTier,
    lambda: 0.0, // Handled by separate category retargeting termination rule
  },
} as const;

/**
 * Robust exponential decay calculator.
 * Prevents NaN poisoning if lambda or deltaDays are invalid.
 */
export function calculateExponentialDecay(baseWeight: number, lambda: number, deltaDays: number): number {
  if (!Number.isFinite(baseWeight) || !Number.isFinite(lambda) || !Number.isFinite(deltaDays)) {
    return 0;
  }
  if (deltaDays < 0 || lambda <= 0) {
    return baseWeight;
  }
  const score = baseWeight * Math.exp(-lambda * deltaDays);
  return Number.isFinite(score) ? score : 0;
}

/**
 * Trust Multipliers:
 * Scales signal weight by user account verification and history to defeat bot gaming.
 */
export const TRUST_MULTIPLIERS = {
  UNVERIFIED: 0.20,
  BASIC: 0.80,
  VERIFIED: 1.20,
} as const;

/**
 * Sigmoid Cold-Start Transition Parameters:
 * alpha(n_effective) = 1 / (1 + e^(-k * (n_effective - n0)))
 */
export const SIGMOID_CONFIG = {
  INFLECTION_POINT_N0: 5.0, // Midpoint where personalized weight = 0.50
  STEEPNESS_K: 0.8,         // Controls curve steepness
};

/**
 * Computes the personalization blend factor alpha in [0.0, 1.0].
 * - Near 0: Dominated by category baseline popularity
 * - Near 1: Dominated by personalized buyer interest profile
 */
export function computeSigmoidAlpha(effectiveSignalCount: number): number {
  const { INFLECTION_POINT_N0, STEEPNESS_K } = SIGMOID_CONFIG;
  const exponent = -STEEPNESS_K * (effectiveSignalCount - INFLECTION_POINT_N0);
  const alpha = 1 / (1 + Math.exp(exponent));
  return Number.isFinite(alpha) ? alpha : 0.5;
}

/**
 * Multi-Factor Scoring Weights
 */
export const RANKING_WEIGHTS = {
  INTENT: 0.40,
  LOCATION: 0.20,
  VERIFICATION: 0.15,
  RESPONSE: 0.15,
  FRESHNESS: 0.10,
  NEW_SUPPLIER_BONUS: 0.08,
  NEW_SUPPLIER_MIN_INTENT_GATE: 0.40,
  EXPLORATION_RATIO: 0.10, // 10% configurable exploration slots
} as const;

/**
 * Normalizes supplier response score.
 * New suppliers with null response rate receive a neutral 0.50 score instead of 1.0.
 */
export function calculateResponseScore(replyRate24h: number | null | undefined): number {
  if (replyRate24h === null || replyRate24h === undefined) {
    return 0.50; // Neutral baseline for new suppliers without interaction history
  }
  return Math.min(Math.max(replyRate24h / 100, 0.0), 1.0);
}
