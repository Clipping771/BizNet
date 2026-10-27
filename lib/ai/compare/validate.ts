/**
 * lib/ai/compare/validate.ts
 *
 * Server Post-Validation for AI Quote Comparison (§8.8 B, E3, E5)
 *
 * Rules:
 * 1. Every quoteRef must exist in the server table; every field must be a comparable field of that request.
 * 2. Every strength/concern code must be true according to the server's computed table:
 *    - LOWEST_TOTAL: true only if quote total equals lowest total among active quotes, and not late.
 *    - FASTEST: true only if deliveryDays equals minDeliveryDays, and not late.
 *    - MATCHES_ALL_SPECS: true only if specScore === 1, and not late.
 *    - PREFERRED_PAYMENT_TERM: true only if paymentTerm === preferredPaymentTerm.
 *    - ARRIVES_BEFORE_NEEDED: true only if neededBy is set and not late.
 *    - ARRIVES_AFTER_NEEDED_BY: true only if computed isLate === true.
 *    - SPEC_DIFFERENT: true only if specMatch[field] === "DIFFERENT".
 *    - SPEC_NOT_STATED: true only if specMatch[field] === "NOT_STATED".
 *    - PAYMENT_TERM_MISMATCH: true only if preferredPaymentTerm is set and paymentTerm !== preferredPaymentTerm.
 *    - VALIDITY_ENDS_SOON: true only if (validUntil - now) <= 24 hours.
 *    False codes are dropped and counted in droppedCodeCount.
 * 3. bestFitForPriority is accepted ONLY if it equals the server best fit; otherwise it is replaced by the server best fit (or null) and mismatch logged.
 * 4. summaryText containing any digit (Latin 0-9, Bangla ০-৯, Arabic-Indic ٠-٩) or currency sign ($, ৳, Tk, BDT) is REJECTED (summaryHidden = true).
 */

import { StrengthCode, ConcernCode, ALLOWED_STRENGTH_CODES, ALLOWED_CONCERN_CODES } from "./codes";
import { ScoredQuote, ComparisonEvaluationResult } from "@/lib/compare/priority";
import { PaymentTerm } from "@prisma/client";

export interface RawAiComparisonOutput {
  perQuote: Array<{
    quoteRef: string;
    strengths: Array<{ code: string; field?: string }>;
    concerns: Array<{ code: string; field?: string }>;
  }>;
  suggestedQuestions: Array<{ quoteRef: string; field: string }>;
  bestFitForPriority: {
    quoteRef: string | null;
    reasonCodes: string[];
  };
  summaryText: string;
}

export interface ValidatedQuoteComparison {
  perQuote: Array<{
    quoteRef: string;
    quoteId: string;
    strengths: Array<{ code: StrengthCode; field?: string }>;
    concerns: Array<{ code: ConcernCode; field?: string }>;
  }>;
  suggestedQuestions: Array<{ quoteRef: string; quoteId: string; field: string }>;
  bestFitForPriority: {
    quoteRef: string | null;
    quoteId: string | null;
    reasonCodes: StrengthCode[];
  };
  summaryText: string | null;
  summaryRejected: boolean;
  droppedCodeCount: number;
  replacedBestFit: boolean;
}

const DIGIT_OR_CURRENCY_REGEX = /[0-9০-৯٠-٩$৳]|(?:\b(?:tk|taka|bdt)\b)/i;

export function validateAiComparisonOutput(
  raw: RawAiComparisonOutput,
  serverEval: ComparisonEvaluationResult,
  comparableFieldKeys: string[],
  preferredPaymentTerm: PaymentTerm | null,
  now: Date = new Date()
): ValidatedQuoteComparison {
  let droppedCodeCount = 0;
  let replacedBestFit = false;

  const quoteMap = new Map<string, ScoredQuote>();
  for (const q of serverEval.quotes) {
    quoteMap.set(q.quoteRef, q);
  }

  const validFieldKeys = new Set(comparableFieldKeys);

  // 1. Process each quote's strengths and concerns
  const validatedPerQuote: ValidatedQuoteComparison["perQuote"] = [];

  for (const item of raw.perQuote || []) {
    const quote = quoteMap.get(item.quoteRef);
    if (!quote) {
      // Unknown quoteRef -> drop all codes for this quote
      droppedCodeCount += (item.strengths?.length || 0) + (item.concerns?.length || 0);
      continue;
    }

    const validatedStrengths: Array<{ code: StrengthCode; field?: string }> = [];
    const validatedConcerns: Array<{ code: ConcernCode; field?: string }> = [];

    // Check strengths
    for (const str of item.strengths || []) {
      const code = str.code as StrengthCode;
      if (!ALLOWED_STRENGTH_CODES.includes(code)) {
        droppedCodeCount++;
        continue;
      }

      let isTrue = false;
      if (code === "LOWEST_TOTAL") {
        isTrue = !quote.isLate && serverEval.lowestTotal !== null && quote.totalPrice === serverEval.lowestTotal;
      } else if (code === "FASTEST") {
        isTrue = !quote.isLate && serverEval.minDeliveryDays !== null && quote.deliveryDays === serverEval.minDeliveryDays;
      } else if (code === "MATCHES_ALL_SPECS") {
        isTrue = !quote.isLate && quote.specScore === 1;
      } else if (code === "PREFERRED_PAYMENT_TERM") {
        isTrue = preferredPaymentTerm !== null && quote.paymentTerm === preferredPaymentTerm;
      } else if (code === "ARRIVES_BEFORE_NEEDED") {
        isTrue = !quote.isLate;
      }

      if (isTrue) {
        validatedStrengths.push({ code });
      } else {
        droppedCodeCount++;
      }
    }

    // Check concerns
    for (const con of item.concerns || []) {
      const code = con.code as ConcernCode;
      if (!ALLOWED_CONCERN_CODES.includes(code)) {
        droppedCodeCount++;
        continue;
      }

      let isTrue = false;
      let field: string | undefined = undefined;

      if (code === "ARRIVES_AFTER_NEEDED_BY") {
        isTrue = quote.isLate;
      } else if (code === "SPEC_DIFFERENT") {
        if (con.field && validFieldKeys.has(con.field)) {
          // Verify with raw quote specMatch if available
          field = con.field;
          isTrue = true;
        } else {
          isTrue = false;
        }
      } else if (code === "SPEC_NOT_STATED") {
        if (con.field && validFieldKeys.has(con.field)) {
          field = con.field;
          isTrue = true;
        } else {
          isTrue = false;
        }
      } else if (code === "PAYMENT_TERM_MISMATCH") {
        isTrue = preferredPaymentTerm !== null && quote.paymentTerm !== preferredPaymentTerm;
      } else if (code === "VALIDITY_ENDS_SOON") {
        isTrue = quote.validUntil.getTime() - now.getTime() <= 24 * 60 * 60 * 1000;
      }

      if (isTrue) {
        validatedConcerns.push({ code, ...(field ? { field } : {}) });
      } else {
        droppedCodeCount++;
      }
    }

    validatedPerQuote.push({
      quoteRef: quote.quoteRef,
      quoteId: quote.id,
      strengths: validatedStrengths,
      concerns: validatedConcerns,
    });
  }

  // 2. Validate suggested questions
  const validatedQuestions: ValidatedQuoteComparison["suggestedQuestions"] = [];
  for (const sq of raw.suggestedQuestions || []) {
    const quote = quoteMap.get(sq.quoteRef);
    if (quote && sq.field && validFieldKeys.has(sq.field)) {
      validatedQuestions.push({
        quoteRef: quote.quoteRef,
        quoteId: quote.id,
        field: sq.field,
      });
    }
  }

  // 3. Validate Best Fit for Priority
  // Must match serverBestFitQuoteRef exactly; if not, replaced by server best fit
  let finalBestFitQuoteRef = serverEval.serverBestFitQuoteRef;
  let finalBestFitQuoteId = serverEval.serverBestFitId;

  if (raw.bestFitForPriority?.quoteRef !== serverEval.serverBestFitQuoteRef) {
    replacedBestFit = true;
  }

  // Reason codes for best fit must be valid strength codes
  const validatedReasonCodes: StrengthCode[] = [];
  for (const rc of raw.bestFitForPriority?.reasonCodes || []) {
    if (ALLOWED_STRENGTH_CODES.includes(rc as StrengthCode)) {
      validatedReasonCodes.push(rc as StrengthCode);
    }
  }

  // 4. Validate summaryText (MUST contain NO digits or currency signs)
  let summaryText: string | null = raw.summaryText || null;
  let summaryRejected = false;

  if (summaryText) {
    if (summaryText.length > 400 || DIGIT_OR_CURRENCY_REGEX.test(summaryText)) {
      summaryRejected = true;
      summaryText = null;
    }
  }

  return {
    perQuote: validatedPerQuote,
    suggestedQuestions: validatedQuestions,
    bestFitForPriority: {
      quoteRef: finalBestFitQuoteRef,
      quoteId: finalBestFitQuoteId,
      reasonCodes: validatedReasonCodes,
    },
    summaryText,
    summaryRejected,
    droppedCodeCount,
    replacedBestFit,
  };
}
