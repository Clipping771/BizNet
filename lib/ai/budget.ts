import { executeAtomicBudgetReservation, executeBudgetRefund } from "../repo/budget";
import { updateSetting, getSetting } from "../settings";
import { logAudit } from "../audit";

export interface ReserveBudgetOptions {
  userId?: string;
  maxOutputTokens: number;
  inputTokensUpperBound?: number;
  inPricePerToken?: number;
  outPricePerToken?: number;
  globalDailyCap?: number;
  userDailyCap?: number;
}

export interface BudgetReservation {
  reserved: boolean;
  maxCost: number;
  day: string; // YYYY-MM-DD
  scopes: string[];
  reason?: string;
}

const DEFAULT_IN_PRICE = 0.00000015; // $0.15 per 1M tokens
const DEFAULT_OUT_PRICE = 0.0000006;  // $0.60 per 1M tokens

/**
 * Calculates the exact maximum possible cost of an AI invocation before sending.
 */
export function calculateMaxCost(
  maxOutputTokens: number,
  inputTokensUpperBound: number = 2000,
  inPrice: number = DEFAULT_IN_PRICE,
  outPrice: number = DEFAULT_OUT_PRICE
): number {
  return Number((inputTokensUpperBound * inPrice + maxOutputTokens * outPrice).toFixed(6));
}

/**
 * Atomically reserves the maximum cost against global and per-user daily budgets.
 */
export async function reserveAiBudget(options: ReserveBudgetOptions): Promise<BudgetReservation> {
  const maxOutputTokens = options.maxOutputTokens;
  const inputTokensUpperBound =
    options.inputTokensUpperBound !== undefined ? options.inputTokensUpperBound : 2000;
  const inPrice = options.inPricePerToken || DEFAULT_IN_PRICE;
  const outPrice = options.outPricePerToken || DEFAULT_OUT_PRICE;
  const maxCost = calculateMaxCost(maxOutputTokens, inputTokensUpperBound, inPrice, outPrice);

  const globalCap = options.globalDailyCap ?? 10.0;
  const userCap = options.userDailyCap ?? 2.0;

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD in UTC
  const scopes = ["global"];
  if (options.userId) {
    scopes.push(`user:${options.userId}`);
  }

  // Check if AI is suspended for today due to a prior budget overrun
  const aiDisabledUntilDay = await getSetting("aiDisabledUntilDay");
  if (aiDisabledUntilDay === today) {
    return {
      reserved: false,
      maxCost,
      day: today,
      scopes,
      reason: "AI features temporarily suspended for today due to budget overrun",
    };
  }

  const reservedScopes: string[] = [];

  try {
    for (const scope of scopes) {
      const cap = scope === "global" ? globalCap : userCap;
      const ok = await executeAtomicBudgetReservation(scope, today, maxCost, cap);
      if (!ok) {
        // Rollback any earlier reservation in this transaction
        for (const resScope of reservedScopes) {
          await executeBudgetRefund(maxCost, resScope, today);
        }
        return {
          reserved: false,
          maxCost,
          day: today,
          scopes,
          reason: "Daily AI budget exhausted",
        };
      }
      reservedScopes.push(scope);
    }

    return {
      reserved: true,
      maxCost,
      day: today,
      scopes,
    };
  } catch (err: any) {
    // Rollback on unexpected error
    for (const resScope of reservedScopes) {
      await executeBudgetRefund(maxCost, resScope, today);
    }
    return {
      reserved: false,
      maxCost,
      day: today,
      scopes,
      reason: err.message,
    };
  }
}

/**
 * Refunds unused reservation after actual execution, ensuring spentUsd equals actual cost.
 * If actualCost > maxCost, logs BUDGET_OVERRUN and disables the feature for the day.
 */
export async function refundAiBudget(
  reservation: BudgetReservation,
  actualCost: number,
  featureName: string = "REQUEST_ASSISTANT"
): Promise<void> {
  if (!reservation.reserved) return;

  const maxCost = reservation.maxCost;

  if (actualCost > maxCost) {
    console.error(`🚨 BUDGET_OVERRUN detected: actualCost ($${actualCost}) > maxCost ($${maxCost})`);

    await logAudit({
      action: "BUDGET_OVERRUN",
      entityType: "AI_FEATURE",
      entityId: featureName,
      before: { maxCost, scopes: reservation.scopes },
      after: { actualCost, day: reservation.day },
    });

    // Suspend AI calls for the remainder of today only
    await updateSetting("aiDisabledUntilDay", reservation.day);
    return;
  }

  const refund = Number((maxCost - actualCost).toFixed(6));
  if (refund <= 0) return;

  for (const scope of reservation.scopes) {
    await executeBudgetRefund(refund, scope, reservation.day);
  }
}
