import { z } from "zod";

export interface AiOptions {
  maxOutputTokens: number;
  inputTokensUpperBound?: number;
  userId?: string;
  businessId?: string;
  feature?: "REQUEST_ASSISTANT" | "QUOTE_COMPARISON" | "TRANSLATION" | "TRANSCRIPTION";
  promptVersion?: string;
}

export interface AiResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  model: string;
  provider: string;
  cacheHit?: boolean;
}

export interface AiProvider {
  structured<T>(
    schema: z.ZodSchema<T>,
    prompt: string,
    options: AiOptions
  ): Promise<AiResult<T>>;
  complete(prompt: string, options: AiOptions): Promise<AiResult<string>>;
  transcribe(
    audioBuffer: Buffer,
    mimeType: string,
    options?: { timeoutMs?: number }
  ): Promise<{ text: string }>;
}

export class MockAiProvider implements AiProvider {
  private simulateOverrun: boolean = false;

  constructor(options?: { simulateOverrun?: boolean }) {
    if (options?.simulateOverrun) {
      this.simulateOverrun = true;
    }
  }

  async structured<T>(
    schema: z.ZodSchema<T>,
    prompt: string,
    options: AiOptions
  ): Promise<AiResult<T>> {
    const start = Date.now();
    let data: any = {};

    if (options?.feature === "QUOTE_COMPARISON") {
      return {
        data: schema.parse(mockQuoteComparison(prompt)),
        inputTokens: 200,
        outputTokens: 120,
        costUsd: 200 * 0.00000015 + 120 * 0.0000006,
        latencyMs: Date.now() - start,
        model: "mock-gpt-4o",
        provider: "mock",
      };
    }

    // Dynamic parsing in MockAiProvider for eval coverage
    // Extract actual buyer text from prompt to avoid matching category schema words
    const buyerTextMatch = prompt.match(/Buyer text:\s*"([\s\S]*?)"/i);
    const targetText = buyerTextMatch ? buyerTextMatch[1] : prompt;
    const lower = targetText.toLowerCase();

    let catSlug: string | null = null;
    let title = "General packaging request";
    let attrs: Record<string, any> = {};
    let qty: number | null = null;
    let unit: string | null = "pcs";
    let deliveryArea: string | null = null;
    let uncertainFields: string[] = [];
    let questions: any[] = [];

    // Category detection
    if (lower.includes("container") || lower.includes("কন্টেইনার")) {
      catSlug = "containers";
      title = "৭৫০ মিলি ঢাকনাওয়ালা কন্টেইনার";
      attrs = { capacity_ml: 750, has_lid: true };
      uncertainFields = ["material"];
      questions = [
        {
          field: "material",
          question: "কন্টেইনারের উপাদান কি হবে?",
          options: ["plastic_pp", "paper", "aluminium"],
        },
      ];
    } else if (lower.includes("box") || lower.includes("বাক্স") || lower.includes("বক্স")) {
      catSlug = "food_boxes";
      title = "খাবারের বক্স";
      attrs = { box_type: "burger_box" };
      uncertainFields = ["material"];
      questions = [
        {
          field: "material",
          question: "বক্সের উপাদান কি হবে?",
          options: ["duplex_board", "kraft_paper"],
        },
      ];
    } else if (lower.includes("bag") || lower.includes("ব্যাগ")) {
      catSlug = "carry_bags";
      title = "শপিং ব্যাগ";
      attrs = { material: "kraft" };
      uncertainFields = ["handle_type"];
      questions = [
        {
          field: "handle_type",
          question: "হ্যান্ডেল কেমন চান?",
          options: ["loop", "die_cut", "twisted", "none"],
        },
      ];
    } else if (lower.includes("cup") || lower.includes("কাপ")) {
      catSlug = "cups";
      title = "চা বা কফির কাপ";
      attrs = { capacity_ml: 250, has_lid: false };
      uncertainFields = ["material"];
      questions = [
        {
          field: "material",
          question: "কাপের উপাদান কি?",
          options: ["paper", "plastic_pp"],
        },
      ];
    } else if (lower.includes("tissue") || lower.includes("টিস্যু")) {
      catSlug = "tissue";
      title = "ফেসিয়াল টিস্যু";
      attrs = { ply: 2 };
    } else if (lower.includes("spoon") || lower.includes("fork") || lower.includes("চামচ") || lower.includes("cutlery")) {
      catSlug = "cutlery";
      title = "প্লাস্টিক বা কাঠের চামচ";
      attrs = { item_type: "spoon" };
    } else if (lower.includes("foil") || lower.includes("ফয়েল")) {
      catSlug = "foil_wrap";
      title = "অ্যালুমিনিয়াম ফয়েল র‍্যাপ";
      attrs = { width_cm: 30 };
    }

    // Quantity detection
    const qtyMatch = targetText.match(/\b(\d{1,6})\s*(টা|টি|পিস|pcs|pieces)?\b/);
    if (qtyMatch) {
      qty = parseInt(qtyMatch[1], 10);
    } else if (catSlug) {
      qty = 500;
    }

    // Relative date detection
    let daysToAdd = 3;
    if (lower.includes("কাল") || lower.includes("tomorrow") || lower.includes("আগামীকাল")) {
      daysToAdd = 1;
    } else if (lower.includes("পরশু") || lower.includes("day after tomorrow")) {
      daysToAdd = 2;
    } else if (lower.includes("next week") || lower.includes("পরের সপ্তাহ")) {
      daysToAdd = 7;
    }
    const neededBy = new Date(Date.now() + daysToAdd * 86400000).toISOString().split("T")[0];

    // Delivery Area
    if (lower.includes("mirpur") || lower.includes("মিরপুর")) deliveryArea = "Mirpur";
    else if (lower.includes("dhanmondi") || lower.includes("ধানমন্ডি")) deliveryArea = "Dhanmondi";
    else if (lower.includes("uttara") || lower.includes("উত্তরা")) deliveryArea = "Uttara";
    else if (lower.includes("gulshan") || lower.includes("গুলশান")) deliveryArea = "Gulshan";

    data = {
      categorySlug: catSlug,
      title: title,
      attributes: attrs,
      quantity: qty,
      unit: unit,
      neededBy: neededBy,
      deliveryArea: deliveryArea,
      preferredPaymentTerm: "CASH_ON_DELIVERY",
      priority: "BALANCED",
      uncertainFields: uncertainFields,
      questions: questions,
      notes: null,
    };

    const inputTokens = 120;
    const outputTokens = 150;
    // Price per token: $0.15/1M in ($0.00000015), $0.60/1M out ($0.0000006)
    let costUsd = inputTokens * 0.00000015 + outputTokens * 0.0000006;

    if (this.simulateOverrun) {
      // Intentionally report higher cost than reserved for test
      costUsd = 100.0;
    }

    return {
      data: schema.parse(data),
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs: Date.now() - start,
      model: "mock-gpt-4o",
      provider: "mock",
    };
  }

  async complete(prompt: string, options: AiOptions): Promise<AiResult<string>> {
    const start = Date.now();
    return {
      data: "Mock response summary without digits.",
      inputTokens: 50,
      outputTokens: 20,
      costUsd: 0.000015,
      latencyMs: Date.now() - start,
      model: "mock-gpt-4o",
      provider: "mock",
    };
  }

  async transcribe(
    audioBuffer: Buffer,
    mimeType: string,
    options?: { timeoutMs?: number }
  ): Promise<{ text: string }> {
    return {
      text: "কাল মিরপুরে ৫০০টা ৭৫০ মিলি ঢাকনাওয়ালা কন্টেইনার লাগবে",
    };
  }
}

export function getAiProvider(): AiProvider {
  return new MockAiProvider();
}

/**
 * Deterministic mock for AI Quote Comparison: reads the server table from the prompt
 * and answers in codes only (no numbers), like a well-behaved model would.
 */
function mockQuoteComparison(prompt: string) {
  const tableText = prompt.split("Table:")[1]?.split("Return code-based")[0] ?? "[]";
  let rows: Array<{
    quoteRef: string;
    totalPrice: number;
    deliveryDays: number;
    isLate: boolean;
    specScore: number;
    priorityScore: number;
    eligibleForBestFit: boolean;
  }> = [];
  try {
    rows = JSON.parse(tableText.trim());
  } catch {
    rows = [];
  }
  const onTime = rows.filter((r) => !r.isLate);
  const minTotal = Math.min(...onTime.map((r) => r.totalPrice));
  const minDays = Math.min(...onTime.map((r) => r.deliveryDays));
  const best = [...rows]
    .filter((r) => r.eligibleForBestFit)
    .sort((a, b) => b.priorityScore - a.priorityScore)[0];

  return {
    perQuote: rows.map((r) => ({
      quoteRef: r.quoteRef,
      strengths: [
        ...(!r.isLate && r.totalPrice === minTotal ? [{ code: "LOWEST_TOTAL" }] : []),
        ...(!r.isLate && r.deliveryDays === minDays ? [{ code: "FASTEST" }] : []),
        ...(!r.isLate && r.specScore === 1 ? [{ code: "MATCHES_ALL_SPECS" }] : []),
        ...(!r.isLate ? [{ code: "ARRIVES_BEFORE_NEEDED" }] : []),
      ],
      concerns: r.isLate ? [{ code: "ARRIVES_AFTER_NEEDED_BY" }] : [],
    })),
    suggestedQuestions: [],
    bestFitForPriority: { quoteRef: best?.quoteRef ?? null, reasonCodes: best ? ["FASTEST"] : [] },
    summaryText: best
      ? "The suggested quote fits your priority best; check the late delivery warnings before you decide."
      : "No quote fits your priority yet; compare the details in the table.",
  };
}
