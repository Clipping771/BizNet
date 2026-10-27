import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { getAuthzContext } from "@/lib/auth-user";
import { findCachedAiInteraction, createAiInteractionRecord } from "@/lib/repo/ai";
import { findRequestByCode } from "@/lib/repo/request";
import { getReliabilitySummaries } from "@/lib/repo/order";
import {
  evaluateQuotePriorities,
  type QuoteComparisonInput,
  type RequestComparisonContext,
} from "@/lib/compare/priority";
import {
  validateAiComparisonOutput,
  type RawAiComparisonOutput,
} from "@/lib/ai/compare/validate";
import { getAiProvider } from "@/lib/ai/provider";
import { reserveAiBudget, refundAiBudget } from "@/lib/ai/budget";
import { getSetting } from "@/lib/settings";
import { Priority, QuoteStatus } from "@prisma/client";
import { limitMutation } from "@/lib/http/guard";

const AiCompareResponseSchema = z.object({
  perQuote: z.array(
    z.object({
      quoteRef: z.string(),
      strengths: z.array(
        z.object({
          code: z.string(),
          field: z.string().optional(),
        })
      ),
      concerns: z.array(
        z.object({
          code: z.string(),
          field: z.string().optional(),
        })
      ),
    })
  ),
  suggestedQuestions: z.array(
    z.object({
      quoteRef: z.string(),
      field: z.string(),
    })
  ),
  bestFitForPriority: z.object({
    quoteRef: z.string().nullable(),
    reasonCodes: z.array(z.string()),
  }),
  summaryText: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const limited = await limitMutation(req, "quote-compare", 300);
    if (limited) return limited;
    const { user, ctx, error, status } = await getAuthzContext(req);
    if (error || !user || !ctx) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status });
    }

    const body = await req.json();
    const { requestCode, priority, withAi } = body;

    if (!requestCode) {
      return NextResponse.json({ error: "requestCode is required" }, { status: 400 });
    }

    const request = await findRequestByCode(requestCode);
    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (request.buyerBusinessId !== ctx.activeBusinessId && ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "IDOR: Cannot compare quotes for another business's request" }, { status: 403 });
    }

    const chosenPriority: Priority = Object.values(Priority).includes(priority)
      ? (priority as Priority)
      : request.priority || Priority.BALANCED;

    // Comparable attribute keys from category schema
    const schemaFields: any[] = (request.category.attributeSchema as any)?.fields || [];
    const comparableFieldKeys = schemaFields
      .filter((f) => f.comparable)
      .map((f) => f.key);

    const now = new Date();
    // The priority engine derives the Asia/Dhaka calendar day from this instant
    const todayDhaka = now;

    // Prepare quotes input for deterministic evaluation
    const quoteInputs: QuoteComparisonInput[] = request.quotes.map((q, idx) => ({
      id: q.id,
      quoteRef: `Q${idx + 1}`,
      totalPrice: q.totalPrice.toNumber(),
      deliveryDays: q.deliveryDays,
      paymentTerm: q.paymentTerm,
      validUntil: q.validUntil,
      status: q.status,
      createdAt: q.createdAt,
      specMatch: (q.specMatch as Record<string, string>) || {},
    }));

    const compContext: RequestComparisonContext = {
      neededBy: request.neededBy,
      preferredPaymentTerm: request.preferredPaymentTerm,
      priority: chosenPriority,
      comparableFieldKeys,
      todayDhaka,
    };

    // 1. Run deterministic priority score & tie-break pure function (§8.8 A2)
    const serverEval = evaluateQuotePriorities(quoteInputs, compContext, now);

    let aiAnalysis: any = null;

    // 2. "Compare with AI" button (§8.8 B, E3)
    if (withAi && serverEval.quotes.length > 0) {
      const quoteIdsStr = request.quotes.map((q) => `${q.id}:v${q.version}`).join(";");
      const cacheKey = `${request.id}:${chosenPriority}:${quoteIdsStr}`;
      const inputHash = crypto.createHash("sha256").update(cacheKey).digest("hex");

      // Check cache (24 hours)
      const cached = await findCachedAiInteraction(
        "QUOTE_COMPARISON",
        inputHash,
        new Date(Date.now() - 24 * 3600 * 1000)
      );

      if (cached && cached.output) {
        aiAnalysis = cached.output;
      } else {
        // Reserve budget
        const reservation = await reserveAiBudget({
          userId: user.id,
          maxOutputTokens: 600,
          inputTokensUpperBound: 1500,
        });

        if (reservation.reserved) {
          try {
            const provider = getAiProvider();
            const aiTimeoutMs = (await getSetting("aiTimeoutMs")) || 8000;

            const tableSummary = serverEval.quotes.map((q) => ({
              quoteRef: q.quoteRef,
              totalPrice: q.totalPrice,
              deliveryDays: q.deliveryDays,
              isLate: q.isLate,
              paymentTerm: q.paymentTerm,
              specScore: q.specScore,
              priorityScore: q.finalScore,
              eligibleForBestFit: q.eligibleForBestFit,
            }));

            const prompt = `
Compare these anonymized quotes for priority: ${chosenPriority}.
All numbers have already been computed by the server. Do not output any numbers or currency signs.
Table:
${JSON.stringify(tableSummary, null, 2)}
Return code-based analysis only.
            `.trim();

            const callPromise = provider.structured(AiCompareResponseSchema, prompt, {
              maxOutputTokens: 600,
              feature: "QUOTE_COMPARISON",
              userId: user.id,
              businessId: ctx.activeBusinessId || undefined,
            });

            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("AI_TIMEOUT")), aiTimeoutMs)
            );

            const aiRes = await Promise.race([callPromise, timeoutPromise]);
            await refundAiBudget(reservation, aiRes.costUsd, "QUOTE_COMPARISON");

            // Post-validation: drop false codes, reject digits in summaryText, enforce server best fit (§8.8 B, E3)
            const validated = validateAiComparisonOutput(
              aiRes.data as RawAiComparisonOutput,
              serverEval,
              comparableFieldKeys,
              request.preferredPaymentTerm,
              now
            );

            aiAnalysis = validated;

            await createAiInteractionRecord({
              userId: user.id,
              businessId: ctx.activeBusinessId || undefined,
              feature: "QUOTE_COMPARISON",
              promptVersion: "quoteCompare.v1",
              provider: aiRes.provider,
              model: aiRes.model,
              inputHash,
              // requestId lets the accept step record whether the buyer ordered the suggested quote
              input: { requestId: request.id, tableSummary },
              output: validated as any,
              costUsd: aiRes.costUsd,
              latencyMs: aiRes.latencyMs,
            });
          } catch (aiErr) {
            console.error("AI comparison error:", aiErr);
            await refundAiBudget(reservation, 0, "QUOTE_COMPARISON");
          }
        }
      }
    }

    // Display rows for the table: supplier identity and the server-side facts per quote (§8.8 A)
    const reliabilityMin = (await getSetting("reliabilityMinFeedbacks")) || 3;
    const reliability = await getReliabilitySummaries(
      request.quotes.map((q) => q.supplierBusinessId),
      reliabilityMin
    );
    const rows = serverEval.quotes.map((sq) => {
      const q = request.quotes.find((x) => x.id === sq.id)!;
      return {
        quoteId: q.id,
        quoteRef: sq.quoteRef,
        supplier: {
          id: q.supplierBusiness.id,
          name: q.supplierBusiness.name,
          area: q.supplierBusiness.area,
          verificationStatus: q.supplierBusiness.verificationStatus,
        },
        unitPrice: q.unitPrice.toString(),
        quantity: q.quantity.toString(),
        deliveryCharge: q.deliveryCharge.toString(),
        totalPrice: q.totalPrice.toString(),
        deliveryDays: q.deliveryDays,
        estimatedArrival: sq.estimatedArrival,
        isLate: sq.isLate,
        paymentTerm: q.paymentTerm,
        paymentTermMatches: !!request.preferredPaymentTerm && q.paymentTerm === request.preferredPaymentTerm,
        specMatch: comparableFieldKeys.map((key) => {
          const match = (q.specMatch as Record<string, any>) || {};
          const status = match[key];
          const offered = status === "DIFFERENT" ? match._offered?.[key] ?? null : null;
          return {
            field: key,
            requested: (request.attributes as Record<string, unknown>)?.[key] ?? null,
            status: status === "MATCH" || status === "DIFFERENT" ? status : "NOT_STATED",
            offered,
          };
        }),
        validUntil: q.validUntil,
        notes: q.notes,
        attachmentKeys: q.attachmentKeys,
        version: q.version,
        status: q.status,
        tags: sq.tags,
        finalScore: sq.finalScore,
        eligibleForBestFit: sq.eligibleForBestFit,
        isBestFit: sq.id === serverEval.serverBestFitId,
        reliability: reliability[q.supplierBusinessId],
      };
    });

    return NextResponse.json({
      deterministic: serverEval,
      rows,
      aiAnalysis,
      comparableFieldKeys,
      request: {
        id: request.id,
        code: request.code,
        title: request.title,
        neededBy: request.neededBy,
        preferredPaymentTerm: request.preferredPaymentTerm,
        priority: chosenPriority,
      },
    });
  } catch (err: any) {
    console.error("Compare quotes route error:", err);
    return NextResponse.json({ error: "Failed to evaluate quotes" }, { status: 500 });
  }
}
