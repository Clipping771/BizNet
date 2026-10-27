/**
 * lib/repo/metrics.ts
 *
 * Metrics dashboard (§13). Every funnel step is its own number (never merged). The cohort is
 * "requests created in [from, to)"; later steps follow those requests even if they happen after `to`.
 */

import { AiFeature, OrderStatus, QuoteSource, QuoteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting, type MetricThresholds } from "@/lib/settings";
import { pct, quantile, round2, thresholdStatus, type ThresholdStatus } from "@/lib/metrics/math";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export interface MetricsResult {
  range: { from: string; to: string };
  funnel: {
    requestsCreated: number;
    uniqueBuyers: number;
    requestsAiAssisted: number;
    requestsManual: number;
    requestsConcierge: number;
    requestsWithInvite: number;
    requestsWithQuote24h: number;
    requestsWithSupplierQuote24h: number;
    requestsWithConciergeQuote24h: number;
    supplierQuote24hPct: number | null;
    requestsWith2Quotes: number;
    medianHoursToFirstQuote: number | null;
    requestsWithOrder: number;
    requestToOrderPct: number | null;
    ordersConfirmed: number;
    ordersCompleted: number;
    confirmedToCompletedPct: number | null;
    completedWithFeedback: number;
    onTimePct: number | null;
    quantityCorrectPct: number | null;
    specMatchPct: number | null;
    buyersInCohort: number;
    buyersWithSecondRequest30d: number;
    secondRequest30dPct: number | null;
    buyersActive60: number;
    buyersActive90: number;
    active60to90Pct: number | null;
    reorderPreviousSupplier: number;
    reorderEveryone: number;
    contactBlocked: number;
    contactRevealed: number;
  };
  ai: {
    assistantUses: number;
    assistantAcceptedPct: number | null;
    assistantEditedPct: number | null;
    assistantDiscardedPct: number | null;
    assistantAcceptedOrEditedPct: number | null;
    assistantFallbackPct: number | null;
    assistantLatencyP50Ms: number | null;
    assistantLatencyP95Ms: number | null;
    assistantCostPerRequestUsd: number | null;
    mostEditedFields: Array<{ field: string; count: number }>;
    comparisonUses: number;
    ordersAfterComparisonPct: number | null;
    ordersMatchingSuggestionPct: number | null;
    comparisonThumbsUpPct: number | null;
    comparisonDroppedCodes: number;
    comparisonCostUsd: number;
    aiCostPerCompletedOrderUsd: number | null;
    latestEval: { categoryAccuracy: number; fieldAccuracy: number; receivedAt: string } | null;
  };
  ops: {
    minutesPerVerification: number | null;
    minutesByActivity: Array<{ activity: string; minutes: number }>;
    totalOpsMinutes: number;
    opsMinutesPer100CompletedOrders: number | null;
    conciergeShareQuotesPct: number | null;
    conciergeShareRequestsPct: number | null;
  };
  health: {
    activeBuyersLast7d: number;
    activeSuppliersLast7d: number;
    supplierResponseRatePct: number | null;
    zeroEligibleRequests: number;
    questionsAsked: number;
    questionsAnswered48hPct: number | null;
  };
  thresholds: Record<string, { value: number | null; status: ThresholdStatus; target: string }>;
}

export async function computeMetrics(fromDate: Date, toDate: Date): Promise<MetricsResult> {
  const range = { gte: fromDate, lt: toDate };

  // ---- Funnel ---------------------------------------------------------------------------
  const requests = await prisma.request.findMany({
    where: { createdAt: range, status: { not: "DRAFT" } },
    select: {
      id: true,
      buyerBusinessId: true,
      createdAt: true,
      aiInteractionId: true,
      createdViaConcierge: true,
      invites: { select: { id: true } },
      quotes: { where: { status: { not: QuoteStatus.WITHDRAWN } }, select: { createdAt: true, source: true } },
      order: { select: { id: true } },
    },
  });

  let withQuote24h = 0;
  let supplier24h = 0;
  let concierge24h = 0;
  const hoursToFirst: number[] = [];
  for (const r of requests) {
    const within = r.quotes.filter((q) => q.createdAt.getTime() - r.createdAt.getTime() <= DAY);
    if (within.length > 0) withQuote24h++;
    if (within.some((q) => q.source === QuoteSource.SUPPLIER)) supplier24h++;
    if (within.some((q) => q.source === QuoteSource.CONCIERGE)) concierge24h++;
    if (r.quotes.length > 0) {
      const first = Math.min(...r.quotes.map((q) => q.createdAt.getTime()));
      hoursToFirst.push((first - r.createdAt.getTime()) / HOUR);
    }
  }
  const requestsCreated = requests.length;
  const requestsConcierge = requests.filter((r) => r.createdViaConcierge).length;
  const requestsAiAssisted = requests.filter((r) => !r.createdViaConcierge && r.aiInteractionId).length;
  const requestsWithOrder = requests.filter((r) => r.order).length;

  const orders = await prisma.order.findMany({
    where: { createdAt: range },
    select: { id: true, requestId: true, status: true, createdAt: true, feedback: true },
  });
  const completed = orders.filter((o) => o.status === OrderStatus.COMPLETED);
  const feedbacks = completed.map((o) => o.feedback).filter((f): f is NonNullable<typeof f> => !!f);
  const yesShare = (field: "onTime" | "quantityCorrect" | "matchedSpec") => {
    const answered = feedbacks.filter((f) => f[field] !== null);
    return pct(answered.filter((f) => f[field]).length, answered.length);
  };

  // Buyer retention: cohort = buyers whose FIRST request ever falls in the range
  const cohortBuyers = [...new Set(requests.map((r) => r.buyerBusinessId))];
  const buyerRequests = await prisma.request.findMany({
    where: { buyerBusinessId: { in: cohortBuyers }, status: { not: "DRAFT" } },
    select: { buyerBusinessId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  let cohortSize = 0;
  let second30 = 0;
  let active60 = 0;
  let active90 = 0;
  for (const buyerId of cohortBuyers) {
    const times = buyerRequests.filter((r) => r.buyerBusinessId === buyerId).map((r) => r.createdAt.getTime());
    const first = times[0];
    if (first === undefined || first < fromDate.getTime() || first >= toDate.getTime()) continue;
    cohortSize++;
    if (times.slice(1).some((t) => t - first <= 30 * DAY)) second30++;
    if (times.some((t) => t - first >= 60 * DAY)) active60++;
    if (times.some((t) => t - first >= 90 * DAY)) active90++;
  }

  const events = await prisma.event.findMany({
    where: { createdAt: range, name: { in: ["reorder_started", "contact_blocked", "contact_revealed"] } },
    select: { name: true, props: true },
  });
  const reorderMode = (mode: string) =>
    events.filter((e) => e.name === "reorder_started" && (e.props as any)?.mode === mode).length;

  // ---- AI -------------------------------------------------------------------------------
  const interactions = await prisma.aiInteraction.findMany({
    where: { createdAt: range, feature: { in: [AiFeature.REQUEST_ASSISTANT, AiFeature.QUOTE_COMPARISON] } },
    select: { feature: true, outcome: true, latencyMs: true, costUsd: true, editedFields: true, rating: true, output: true, input: true, createdAt: true, cacheHit: true },
  });
  const assistant = interactions.filter((i) => i.feature === AiFeature.REQUEST_ASSISTANT);
  const assistantWithOutcome = assistant.filter((i) => i.outcome && i.outcome !== "FALLBACK");
  const share = (o: string) => pct(assistantWithOutcome.filter((i) => i.outcome === o).length, assistantWithOutcome.length);
  const editedCounts = new Map<string, number>();
  for (const i of assistant) for (const f of i.editedFields) editedCounts.set(f, (editedCounts.get(f) ?? 0) + 1);
  const assistantCost = assistant.reduce((s, i) => s + Number(i.costUsd), 0);

  const comparison = interactions.filter((i) => i.feature === AiFeature.QUOTE_COMPARISON);
  const comparisonWithOutcome = comparison.filter((i) => i.outcome === "ACCEPTED_AS_IS" || i.outcome === "EDITED");
  const rated = comparison.filter((i) => i.rating !== null);
  const comparedRequestTimes = new Map<string, number>();
  for (const i of comparison) {
    const reqId = (i.input as any)?.requestId;
    if (reqId) comparedRequestTimes.set(reqId, Math.min(comparedRequestTimes.get(reqId) ?? Infinity, i.createdAt.getTime()));
  }
  const ordersAfterComparison = orders.filter((o) => (comparedRequestTimes.get(o.requestId) ?? Infinity) < o.createdAt.getTime()).length;
  const totalAiCost = interactions.reduce((s, i) => s + Number(i.costUsd), 0);
  const latestEval = await getSetting("latestEvalReport");

  // ---- Ops ------------------------------------------------------------------------------
  const opsLogs = await prisma.opsTimeLog.findMany({ where: { createdAt: range }, select: { activity: true, minutes: true } });
  const byActivity = new Map<string, number>();
  for (const l of opsLogs) byActivity.set(l.activity, (byActivity.get(l.activity) ?? 0) + l.minutes);
  const verificationLogs = opsLogs.filter((l) => l.activity === "verification_review");
  const totalOps = opsLogs.reduce((s, l) => s + l.minutes, 0);
  const quotesInRange = await prisma.quote.findMany({ where: { createdAt: range }, select: { source: true } });

  // ---- Supply / demand ------------------------------------------------------------------
  const weekStart = new Date(Math.max(fromDate.getTime(), toDate.getTime() - 7 * DAY));
  const [activeBuyers, activeSuppliers, invites, zeroEligible, questions] = await Promise.all([
    prisma.request.findMany({ where: { createdAt: { gte: weekStart, lt: toDate } }, select: { buyerBusinessId: true }, distinct: ["buyerBusinessId"] }),
    prisma.quote.findMany({ where: { createdAt: { gte: weekStart, lt: toDate }, source: QuoteSource.SUPPLIER }, select: { supplierBusinessId: true }, distinct: ["supplierBusinessId"] }),
    prisma.requestInvite.findMany({
      where: { notifiedAt: range },
      select: { supplierBusinessId: true, request: { select: { quotes: { select: { supplierBusinessId: true } } } } },
    }),
    prisma.report.count({ where: { createdAt: range, targetType: "REQUEST_ZERO_MATCH" } }),
    prisma.question.findMany({
      where: { createdAt: range, deletedAt: null, status: { not: "PENDING_REVIEW" } },
      select: { createdAt: true, answers: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 } },
    }),
  ]);
  const respondedInvites = invites.filter((i) => i.request.quotes.some((q) => q.supplierBusinessId === i.supplierBusinessId)).length;
  const answered48 = questions.filter((q) => q.answers[0] && q.answers[0].createdAt.getTime() - q.createdAt.getTime() <= 48 * HOUR).length;

  const funnel: MetricsResult["funnel"] = {
    requestsCreated,
    uniqueBuyers: cohortBuyers.length,
    requestsAiAssisted,
    requestsManual: requestsCreated - requestsAiAssisted - requestsConcierge,
    requestsConcierge,
    requestsWithInvite: requests.filter((r) => r.invites.length > 0).length,
    requestsWithQuote24h: withQuote24h,
    requestsWithSupplierQuote24h: supplier24h,
    requestsWithConciergeQuote24h: concierge24h,
    supplierQuote24hPct: pct(supplier24h, requestsCreated),
    requestsWith2Quotes: requests.filter((r) => r.quotes.length >= 2).length,
    medianHoursToFirstQuote: quantile(hoursToFirst, 0.5),
    requestsWithOrder,
    requestToOrderPct: pct(requestsWithOrder, requestsCreated),
    ordersConfirmed: orders.length,
    ordersCompleted: completed.length,
    confirmedToCompletedPct: pct(completed.length, orders.length),
    completedWithFeedback: feedbacks.length,
    onTimePct: yesShare("onTime"),
    quantityCorrectPct: yesShare("quantityCorrect"),
    specMatchPct: yesShare("matchedSpec"),
    buyersInCohort: cohortSize,
    buyersWithSecondRequest30d: second30,
    secondRequest30dPct: pct(second30, cohortSize),
    buyersActive60: active60,
    buyersActive90: active90,
    active60to90Pct: pct(active60, cohortSize),
    reorderPreviousSupplier: reorderMode("PREVIOUS_SUPPLIER_ONLY"),
    reorderEveryone: reorderMode("EVERYONE"),
    contactBlocked: events.filter((e) => e.name === "contact_blocked").length,
    contactRevealed: events.filter((e) => e.name === "contact_revealed").length,
  };

  const ai: MetricsResult["ai"] = {
    assistantUses: assistant.length,
    assistantAcceptedPct: share("ACCEPTED_AS_IS"),
    assistantEditedPct: share("EDITED"),
    assistantDiscardedPct: share("DISCARDED"),
    assistantAcceptedOrEditedPct: pct(
      assistantWithOutcome.filter((i) => i.outcome === "ACCEPTED_AS_IS" || i.outcome === "EDITED").length,
      assistantWithOutcome.length
    ),
    assistantFallbackPct: pct(assistant.filter((i) => i.outcome === "FALLBACK").length, assistant.length),
    assistantLatencyP50Ms: quantile(assistant.filter((i) => !i.cacheHit).map((i) => i.latencyMs), 0.5),
    assistantLatencyP95Ms: quantile(assistant.filter((i) => !i.cacheHit).map((i) => i.latencyMs), 0.95),
    assistantCostPerRequestUsd: requestsCreated ? round2(assistantCost / requestsCreated) : null,
    mostEditedFields: [...editedCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([field, count]) => ({ field, count })),
    comparisonUses: comparison.length,
    ordersAfterComparisonPct: pct(ordersAfterComparison, orders.length),
    ordersMatchingSuggestionPct: pct(comparisonWithOutcome.filter((i) => i.outcome === "ACCEPTED_AS_IS").length, comparisonWithOutcome.length),
    comparisonThumbsUpPct: pct(rated.filter((i) => (i.rating ?? 0) > 0).length, rated.length),
    comparisonDroppedCodes: comparison.reduce((s, i) => s + (Number((i.output as any)?.droppedCodeCount) || 0), 0),
    comparisonCostUsd: round2(comparison.reduce((s, i) => s + Number(i.costUsd), 0)) ?? 0,
    aiCostPerCompletedOrderUsd: completed.length ? round2(totalAiCost / completed.length) : null,
    latestEval: latestEval ? { categoryAccuracy: latestEval.categoryAccuracy, fieldAccuracy: latestEval.fieldAccuracy, receivedAt: latestEval.receivedAt } : null,
  };

  const ops: MetricsResult["ops"] = {
    minutesPerVerification: verificationLogs.length ? round2(verificationLogs.reduce((s, l) => s + l.minutes, 0) / verificationLogs.length) : null,
    minutesByActivity: [...byActivity.entries()].sort((a, b) => b[1] - a[1]).map(([activity, minutes]) => ({ activity, minutes })),
    totalOpsMinutes: totalOps,
    opsMinutesPer100CompletedOrders: completed.length ? round2((totalOps / completed.length) * 100) : null,
    conciergeShareQuotesPct: pct(quotesInRange.filter((q) => q.source === QuoteSource.CONCIERGE).length, quotesInRange.length),
    conciergeShareRequestsPct: pct(requestsConcierge, requestsCreated),
  };

  const health: MetricsResult["health"] = {
    activeBuyersLast7d: activeBuyers.length,
    activeSuppliersLast7d: activeSuppliers.length,
    supplierResponseRatePct: pct(respondedInvites, invites.length),
    zeroEligibleRequests: zeroEligible,
    questionsAsked: questions.length,
    questionsAnswered48hPct: pct(answered48, questions.length),
  };

  const t: MetricThresholds = await getSetting("metricThresholds");
  // Requests target is per 4 weeks; scale it to the selected range
  const weeks = Math.max(1, (toDate.getTime() - fromDate.getTime()) / (7 * DAY));
  const requestsTarget = Math.round((t.requestsPer4Weeks * weeks) / 4);
  const thresholds: MetricsResult["thresholds"] = {
    requestsCreated: { value: requestsCreated, status: thresholdStatus(requestsCreated, requestsTarget), target: `≥ ${requestsTarget}` },
    supplierQuote24hPct: { value: funnel.supplierQuote24hPct, status: thresholdStatus(funnel.supplierQuote24hPct, t.supplierQuote24hPct), target: `≥ ${t.supplierQuote24hPct}%` },
    requestToOrderPct: {
      value: funnel.requestToOrderPct,
      status: thresholdStatus(funnel.requestToOrderPct, t.requestToOrderPctMin),
      target: `${t.requestToOrderPctMin}–${t.requestToOrderPctMax}%`,
    },
    confirmedToCompletedPct: { value: funnel.confirmedToCompletedPct, status: thresholdStatus(funnel.confirmedToCompletedPct, t.confirmedToCompletedPct), target: `≥ ${t.confirmedToCompletedPct}%` },
    secondRequest30dPct: { value: funnel.secondRequest30dPct, status: thresholdStatus(funnel.secondRequest30dPct, t.secondRequest30dPct), target: `≥ ${t.secondRequest30dPct}%` },
    active60to90Pct: { value: funnel.active60to90Pct, status: thresholdStatus(funnel.active60to90Pct, t.active60to90Pct), target: `≥ ${t.active60to90Pct}%` },
    questionsAnswered48hPct: { value: health.questionsAnswered48hPct, status: thresholdStatus(health.questionsAnswered48hPct, t.questionsAnswered48hPct), target: `≥ ${t.questionsAnswered48hPct}%` },
    assistantAcceptedOrEditedPct: {
      value: ai.assistantAcceptedOrEditedPct,
      status: thresholdStatus(ai.assistantAcceptedOrEditedPct, t.assistantAcceptedOrEditedPct),
      target: `≥ ${t.assistantAcceptedOrEditedPct}%`,
    },
  };

  return { range: { from: fromDate.toISOString(), to: toDate.toISOString() }, funnel, ai, ops, health, thresholds };
}

/** Flattens the metrics into `section,metric,value` CSV rows. */
export function metricsToCsv(m: MetricsResult): string {
  const rows: string[] = ["section,metric,value"];
  const add = (section: string, obj: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(obj)) {
      const v = Array.isArray(value) ? JSON.stringify(value) : value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
      rows.push(`${section},${key},"${v.replace(/"/g, '""')}"`);
    }
  };
  add("funnel", m.funnel);
  add("ai", m.ai);
  add("ops", m.ops);
  add("health", m.health);
  rows.push(`range,from,${m.range.from}`, `range,to,${m.range.to}`);
  return rows.join("\n") + "\n";
}
