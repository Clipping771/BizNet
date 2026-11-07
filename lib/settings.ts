import { findSettingByKey, upsertSettingRecord } from "./repo/settings";

export interface PlatformSettings {
  aiEnabled: boolean;
  aiRequestAssistantEnabled: boolean;
  aiQuoteComparisonEnabled: boolean;
  /** F24 helpers: built and tested, off until an admin turns each one on. */
  aiListingWriterEnabled: boolean;
  aiQuoteAssistantEnabled: boolean;
  aiDiscussionAnswersEnabled: boolean;
  aiMarketInsightEnabled: boolean;
  aiSemanticSearchEnabled: boolean;
  aiTrustSignalsEnabled: boolean;
  aiProviderModelRequest: string;
  aiProviderModelCompare: string;
  aiDailyBudgetUsd: number;
  aiDailyRequestsPerUser: number;
  aiTimeoutMs: number;
  prohibitedItems: string[];
  matchingRadiusKm: number;
  maxInvitesPerRequest: number;
  maxQuotesPerRequest: number;
  defaultQuoteWindowHours: number;
  maxOpenRequestsPerBusiness: number;
  sellingFilterTerms: string[];
  marketPriceMinQuotes: number;
  marketPriceMinSuppliers: number;
  reliabilityMinFeedbacks: number;
  leadCreditsEnabled: boolean;
  freeTrialCredits: number;
  creditPacks: { credits: number; priceBdt: number }[];
  /** bKash / Nagad merchant numbers shown on the credits page for manual payments (READY). */
  paymentReceivers: { bkash: string; nagad: string };
  translationEnabled: boolean;
  translationDailyBudgetUsd: number;
  evalMinCategoryAccuracy: number;
  evalMinFieldAccuracy: number;
  aiDisabledUntilDay: string | null;
  /** §13 default thresholds (hypotheses, admin-editable). */
  metricThresholds: MetricThresholds;
  /** Latest real-provider AI eval report posted by the nightly CI workflow (§12). */
  latestEvalReport: EvalReport | null;
}

export interface MetricThresholds {
  requestsPer4Weeks: number;
  supplierQuote24hPct: number;
  requestToOrderPctMin: number;
  requestToOrderPctMax: number;
  confirmedToCompletedPct: number;
  secondRequest30dPct: number;
  active60to90Pct: number;
  questionsAnswered48hPct: number;
  assistantAcceptedOrEditedPct: number;
}

export interface EvalReport {
  receivedAt: string;
  provider: string;
  categoryAccuracy: number;
  fieldAccuracy: number;
  uncertainFlaggedPct?: number;
  cases: number;
  runUrl?: string | null;
}

export const defaultSettings: PlatformSettings = {
  aiEnabled: true,
  aiRequestAssistantEnabled: true,
  aiQuoteComparisonEnabled: true,
  aiListingWriterEnabled: false,
  aiQuoteAssistantEnabled: false,
  aiDiscussionAnswersEnabled: false,
  aiMarketInsightEnabled: false,
  aiSemanticSearchEnabled: false,
  aiTrustSignalsEnabled: false,
  aiProviderModelRequest: "claude-opus-5-5",
  aiProviderModelCompare: "claude-opus-5-5",
  aiDailyBudgetUsd: 10.0,
  aiDailyRequestsPerUser: 20,
  aiTimeoutMs: 20000,
  aiDisabledUntilDay: null,
  metricThresholds: {
    requestsPer4Weeks: 20,
    supplierQuote24hPct: 50,
    requestToOrderPctMin: 10,
    requestToOrderPctMax: 15,
    confirmedToCompletedPct: 80,
    secondRequest30dPct: 40,
    active60to90Pct: 25,
    questionsAnswered48hPct: 50,
    assistantAcceptedOrEditedPct: 70,
  },
  latestEvalReport: null,
  prohibitedItems: ["alcohol", "weapons", "tobacco", "drugs", "illegal"],
  matchingRadiusKm: 25,
  maxInvitesPerRequest: 15,
  maxQuotesPerRequest: 10,
  defaultQuoteWindowHours: 48,
  maxOpenRequestsPerBusiness: 10,
  sellingFilterTerms: ["বিক্রি", "পাইকারি বিক্রয়", "order now", "call for price", "special discount", "whatsapp us"],
  marketPriceMinQuotes: 8,
  marketPriceMinSuppliers: 3,
  reliabilityMinFeedbacks: 3,
  leadCreditsEnabled: false, // READY - off by default
  freeTrialCredits: 5,
  creditPacks: [
    { credits: 10, priceBdt: 500 },
    { credits: 25, priceBdt: 1100 },
  ],
  translationEnabled: false, // READY - off by default
  translationDailyBudgetUsd: 5.0,
  paymentReceivers: { bkash: "", nagad: "" },
  evalMinCategoryAccuracy: 0.9,
  evalMinFieldAccuracy: 0.8,
};

const CACHE_MS = 30000;
const settingsCache = new Map<string, { value: any; at: number }>();

export async function getSetting<K extends keyof PlatformSettings>(key: K): Promise<PlatformSettings[K]> {
  const now = Date.now();
  const cached = settingsCache.get(key);
  if (cached && now - cached.at < CACHE_MS) {
    return cached.value;
  }

  const record = await findSettingByKey(key);

  if (record && record.value !== undefined) {
    const val = record.value as unknown as PlatformSettings[K];
    settingsCache.set(key, { value: val, at: now });
    return val;
  }

  return defaultSettings[key];
}

export async function updateSetting<K extends keyof PlatformSettings>(
  key: K,
  value: PlatformSettings[K]
): Promise<void> {
  await upsertSettingRecord(key, value);
  settingsCache.set(key, { value, at: Date.now() });
}
