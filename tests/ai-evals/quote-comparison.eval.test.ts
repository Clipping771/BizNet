/**
 * tests/ai-evals/quote-comparison.eval.test.ts
 *
 * Comprehensive evaluation suite for AI Quote Comparison Post-Validation (§8.8, §12, K2).
 * Contains >= 20 test fixtures asserting:
 * - False/hallucinated code dropping and counting
 * - Rejection of digits (Latin, Bangla, Arabic-Indic) and currencies in summaryText
 * - Replacement of mismatched AI best-fit with server best-fit
 * - Ineligibility of late quotes for SPEED/BALANCED best-fit
 * - Question validation on valid/invalid fields
 */

import { describe, it, expect } from "vitest";
import {
  validateAiComparisonOutput,
  RawAiComparisonOutput,
} from "@/lib/ai/compare/validate";
import {
  evaluateQuotePriorities,
  QuoteComparisonInput,
  RequestComparisonContext,
} from "@/lib/compare/priority";
import { PaymentTerm, Priority, QuoteStatus } from "@prisma/client";

describe("AI Quote Comparison Evaluation Suite (>= 20 fixtures)", () => {
  const baseNow = new Date("2026-10-27T10:00:00Z");
  const todayDhaka = new Date("2026-10-27T00:00:00Z");
  const neededBy = new Date("2026-10-30T10:00:00Z"); // 3 days away

  const standardQuotes: QuoteComparisonInput[] = [
    {
      id: "q1",
      quoteRef: "Q1",
      totalPrice: 5000,
      deliveryDays: 2, // arrives in 2 days (on time)
      paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
      validUntil: new Date("2026-11-05T10:00:00Z"),
      status: QuoteStatus.SUBMITTED,
      createdAt: new Date("2026-10-27T08:00:00Z"),
      specMatch: { capacity_ml: "MATCH", has_lid: "MATCH" },
    },
    {
      id: "q2",
      quoteRef: "Q2",
      totalPrice: 4500, // lowest price!
      deliveryDays: 5, // arrives in 5 days (LATE! neededBy is 3 days)
      paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
      validUntil: new Date("2026-11-05T10:00:00Z"),
      status: QuoteStatus.SUBMITTED,
      createdAt: new Date("2026-10-27T09:00:00Z"),
      specMatch: { capacity_ml: "MATCH", has_lid: "MATCH" },
    },
    {
      id: "q3",
      quoteRef: "Q3",
      totalPrice: 5500,
      deliveryDays: 1, // fastest!
      paymentTerm: PaymentTerm.ADVANCE,
      validUntil: new Date("2026-10-28T02:00:00Z"), // expires in 16h (soon!)
      status: QuoteStatus.SUBMITTED,
      createdAt: new Date("2026-10-27T07:00:00Z"),
      specMatch: { capacity_ml: "MATCH", has_lid: "DIFFERENT" },
    },
  ];

  // Helper to run server evaluation
  function runServerEval(priority: Priority = Priority.BALANCED) {
    const ctx: RequestComparisonContext = {
      neededBy,
      preferredPaymentTerm: PaymentTerm.CASH_ON_DELIVERY,
      priority,
      comparableFieldKeys: ["capacity_ml", "has_lid"],
      todayDhaka,
    };
    return evaluateQuotePriorities(standardQuotes, ctx, baseNow);
  }

  // FIXTURE 1: Drops completely unknown strength codes
  it("FIX-1: Drops unknown/hallucinated strength code", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [
        {
          quoteRef: "Q1",
          strengths: [{ code: "CHEAPEST_IN_TOWN" }], // hallucination
          concerns: [],
        },
      ],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Great option for buyers.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, ["capacity_ml", "has_lid"], PaymentTerm.CASH_ON_DELIVERY, baseNow);
    expect(res.droppedCodeCount).toBeGreaterThan(0);
    expect(res.perQuote[0].strengths).toHaveLength(0);
  });

  // FIXTURE 2: Drops completely unknown concern codes
  it("FIX-2: Drops unknown/hallucinated concern code", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [
        {
          quoteRef: "Q1",
          strengths: [],
          concerns: [{ code: "SELLER_IS_RUDE" }], // hallucination
        },
      ],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Valid summary without numbers.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, ["capacity_ml", "has_lid"], PaymentTerm.CASH_ON_DELIVERY, baseNow);
    expect(res.droppedCodeCount).toBeGreaterThan(0);
    expect(res.perQuote[0].concerns).toHaveLength(0);
  });

  // FIXTURE 3: Drops codes referencing non-existent quoteRef
  it("FIX-3: Drops codes referencing non-existent quoteRef", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [
        {
          quoteRef: "Q99", // does not exist
          strengths: [{ code: "LOWEST_TOTAL" }],
          concerns: [],
        },
      ],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Valid summary.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, ["capacity_ml"], PaymentTerm.CASH_ON_DELIVERY, baseNow);
    expect(res.droppedCodeCount).toBe(1);
    expect(res.perQuote).toHaveLength(0);
  });

  // FIXTURE 4: Rejects summary containing Latin digits (0-9)
  it("FIX-4: Rejects summary containing Latin digits (0-9)", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Supplier offers price of 5000 per unit.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.summaryRejected).toBe(true);
    expect(res.summaryText).toBeNull();
  });

  // FIXTURE 5: Rejects summary containing Bengali digits (০-৯)
  it("FIX-5: Rejects summary containing Bengali digits (০-৯)", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "সরবরাহকারী প্রতি পিসে ৫০০ টাকা অফার করেছে।",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.summaryRejected).toBe(true);
    expect(res.summaryText).toBeNull();
  });

  // FIXTURE 6: Rejects summary containing Arabic-Indic digits (٠-٩)
  it("FIX-6: Rejects summary containing Arabic-Indic digits (٠-٩)", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Total amount is ٥٠٠٠ units.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.summaryRejected).toBe(true);
    expect(res.summaryText).toBeNull();
  });

  // FIXTURE 7: Rejects summary containing currency symbols ($ or ৳)
  it("FIX-7: Rejects summary containing currency signs ($ or ৳)", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Lowest price available in ৳ symbol.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.summaryRejected).toBe(true);
    expect(res.summaryText).toBeNull();
  });

  // FIXTURE 8: Rejects summary containing currency words (Tk, Taka, BDT)
  it("FIX-8: Rejects summary containing currency words (Tk, Taka, BDT)", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Great total price in BDT for fast delivery.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.summaryRejected).toBe(true);
    expect(res.summaryText).toBeNull();
  });

  // FIXTURE 9: Accepts valid summary without any digits or currencies
  it("FIX-9: Accepts valid qualitative summary without digits or currencies", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "The first quote delivers on time with verified specifications.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.summaryRejected).toBe(false);
    expect(res.summaryText).toBe("The first quote delivers on time with verified specifications.");
  });

  // FIXTURE 10: Late quote (Q2) can NEVER be best fit under SPEED
  it("FIX-10: Late quote (Q2) can NEVER be best fit under SPEED priority", () => {
    const serverEval = runServerEval(Priority.SPEED);
    expect(serverEval.quotes.find((q) => q.quoteRef === "Q2")?.isLate).toBe(true);
    expect(serverEval.serverBestFitQuoteRef).not.toBe("Q2");

    // Even if AI claims Q2 is best fit, post-validation must replace it
    const raw: RawAiComparisonOutput = {
      perQuote: [],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q2", reasonCodes: ["LOWEST_TOTAL"] },
      summaryText: "Late quote chosen by mistake.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.replacedBestFit).toBe(true);
    expect(res.bestFitForPriority.quoteRef).toBe(serverEval.serverBestFitQuoteRef);
  });

  // FIXTURE 11: Late quote (Q2) can NEVER be best fit under BALANCED
  it("FIX-11: Late quote (Q2) can NEVER be best fit under BALANCED priority", () => {
    const serverEval = runServerEval(Priority.BALANCED);
    expect(serverEval.serverBestFitQuoteRef).not.toBe("Q2");

    const raw: RawAiComparisonOutput = {
      perQuote: [],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q2", reasonCodes: [] },
      summaryText: "Valid summary text.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.replacedBestFit).toBe(true);
    expect(res.bestFitForPriority.quoteRef).toBe("Q1");
  });

  // FIXTURE 12: Preserves best fit when AI matches server calculation
  it("FIX-12: Preserves best fit when AI matches server calculation", () => {
    const serverEval = runServerEval(Priority.BALANCED);
    const raw: RawAiComparisonOutput = {
      perQuote: [],
      suggestedQuestions: [],
      bestFitForPriority: {
        quoteRef: serverEval.serverBestFitQuoteRef,
        reasonCodes: ["MATCHES_ALL_SPECS"],
      },
      summaryText: "Matches server calculation perfectly.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.replacedBestFit).toBe(false);
    expect(res.bestFitForPriority.quoteRef).toBe(serverEval.serverBestFitQuoteRef);
  });

  // FIXTURE 13: Drops questions on invalid/unknown fields
  it("FIX-13: Drops questions on invalid/unknown fields", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [],
      suggestedQuestions: [
        { quoteRef: "Q1", field: "made_up_field" }, // invalid
        { quoteRef: "Q1", field: "capacity_ml" }, // valid
      ],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Valid summary.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, ["capacity_ml", "material"], null, baseNow);
    expect(res.suggestedQuestions).toHaveLength(1);
    expect(res.suggestedQuestions[0].field).toBe("capacity_ml");
  });

  // FIXTURE 14: Validates LOWEST_TOTAL is true for active lowest quote, false otherwise
  it("FIX-14: LOWEST_TOTAL rejected for Q1 because Q1 is not lowest price", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [
        {
          quoteRef: "Q1",
          strengths: [{ code: "LOWEST_TOTAL" }], // Q1 is 5000, lowest active is 4500 (Q2)
          concerns: [],
        },
      ],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Valid summary text.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.perQuote[0].strengths).toHaveLength(0);
    expect(res.droppedCodeCount).toBeGreaterThan(0);
  });

  // FIXTURE 15: FASTEST rejected if quote is late
  it("FIX-15: FASTEST rejected if quote is late", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [
        {
          quoteRef: "Q2", // Q2 is late
          strengths: [{ code: "FASTEST" }],
          concerns: [],
        },
      ],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Valid text.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.perQuote[0].strengths).toHaveLength(0);
  });

  // FIXTURE 16: ARRIVES_AFTER_NEEDED_BY accepted for late quote Q2
  it("FIX-16: ARRIVES_AFTER_NEEDED_BY accepted for late quote Q2", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [
        {
          quoteRef: "Q2",
          strengths: [],
          concerns: [{ code: "ARRIVES_AFTER_NEEDED_BY" }], // True for Q2
        },
      ],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Valid text.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.perQuote[0].concerns).toHaveLength(1);
    expect(res.perQuote[0].concerns[0].code).toBe("ARRIVES_AFTER_NEEDED_BY");
  });

  // FIXTURE 17: VALIDITY_ENDS_SOON accepted when validUntil is within 24h (Q3)
  it("FIX-17: VALIDITY_ENDS_SOON accepted when validUntil is within 24h (Q3)", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [
        {
          quoteRef: "Q3", // valid until 16 hours from baseNow
          strengths: [],
          concerns: [{ code: "VALIDITY_ENDS_SOON" }],
        },
      ],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Valid text.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.perQuote[0].concerns).toHaveLength(1);
    expect(res.perQuote[0].concerns[0].code).toBe("VALIDITY_ENDS_SOON");
  });

  // FIXTURE 18: PREFERRED_PAYMENT_TERM accepted when matching preference
  it("FIX-18: PREFERRED_PAYMENT_TERM accepted when matching preference", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [
        {
          quoteRef: "Q1", // CASH_ON_DELIVERY
          strengths: [{ code: "PREFERRED_PAYMENT_TERM" }],
          concerns: [],
        },
      ],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Valid text.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], PaymentTerm.CASH_ON_DELIVERY, baseNow);
    expect(res.perQuote[0].strengths).toHaveLength(1);
    expect(res.perQuote[0].strengths[0].code).toBe("PREFERRED_PAYMENT_TERM");
  });

  // FIXTURE 19: PAYMENT_TERM_MISMATCH accepted when mismatching preference
  it("FIX-19: PAYMENT_TERM_MISMATCH accepted when mismatching preference", () => {
    const serverEval = runServerEval();
    const raw: RawAiComparisonOutput = {
      perQuote: [
        {
          quoteRef: "Q3", // BANK_TRANSFER != CASH_ON_DELIVERY
          strengths: [],
          concerns: [{ code: "PAYMENT_TERM_MISMATCH" }],
        },
      ],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Valid text.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], PaymentTerm.CASH_ON_DELIVERY, baseNow);
    expect(res.perQuote[0].concerns).toHaveLength(1);
    expect(res.perQuote[0].concerns[0].code).toBe("PAYMENT_TERM_MISMATCH");
  });

  // FIXTURE 20: Summary exceeding 400 characters is rejected
  it("FIX-20: Summary exceeding 400 characters is rejected", () => {
    const serverEval = runServerEval();
    const longSummary = "A".repeat(401);
    const raw: RawAiComparisonOutput = {
      perQuote: [],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: longSummary,
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.summaryRejected).toBe(true);
    expect(res.summaryText).toBeNull();
  });

  // FIXTURE 21: All quotes late -> serverBestFit is null, AI best fit replaced with null
  it("FIX-21: When all quotes are late, best fit is null and AI claim is nullified", () => {
    const allLateQuotes: QuoteComparisonInput[] = [
      {
        id: "l1",
        quoteRef: "Q1",
        totalPrice: 5000,
        deliveryDays: 10, // late
        paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
        validUntil: new Date("2026-11-05T10:00:00Z"),
        status: QuoteStatus.SUBMITTED,
        createdAt: new Date("2026-10-27T08:00:00Z"),
        specMatch: { capacity_ml: "MATCH" },
      },
    ];

    const ctx: RequestComparisonContext = {
      neededBy,
      priority: Priority.SPEED,
      comparableFieldKeys: ["capacity_ml"],
      todayDhaka,
    };

    const serverEval = evaluateQuotePriorities(allLateQuotes, ctx, baseNow);
    expect(serverEval.serverBestFitQuoteRef).toBeNull();

    const raw: RawAiComparisonOutput = {
      perQuote: [],
      suggestedQuestions: [],
      bestFitForPriority: { quoteRef: "Q1", reasonCodes: [] },
      summaryText: "Valid summary text.",
    };

    const res = validateAiComparisonOutput(raw, serverEval, [], null, baseNow);
    expect(res.bestFitForPriority.quoteRef).toBeNull();
    expect(res.replacedBestFit).toBe(true);
  });
});
