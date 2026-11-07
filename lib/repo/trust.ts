/**
 * lib/repo/trust.ts
 *
 * Trust signals on a supplier's public page (F24). Computed from the platform's own records, never
 * written by AI, and shown only when the admin switch is on. Reliability needs the same minimum
 * number of feedbacks as the comparison table.
 */

import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { getReliabilitySummaries } from "@/lib/repo/order";

export interface TrustSignal {
  key: string;
  n?: number;
  total?: number;
}

export async function getTrustSignals(businessId: string): Promise<TrustSignal[]> {
  if (!(await getSetting("aiEnabled")) || !(await getSetting("aiTrustSignalsEnabled"))) return [];

  const [completed, disputed, bestAnswers, minFeedbacks] = await Promise.all([
    prisma.order.count({ where: { supplierBusinessId: businessId, status: "COMPLETED" } }),
    prisma.order.count({ where: { supplierBusinessId: businessId, status: "DISPUTED" } }),
    prisma.question.count({ where: { acceptedAnswer: { authorBusinessId: businessId } } }),
    getSetting("reliabilityMinFeedbacks"),
  ]);
  const reliability = (await getReliabilitySummaries([businessId], minFeedbacks))[businessId];

  const signals: TrustSignal[] = [];
  if (completed > 0) signals.push({ key: "trust.ordersCompleted", n: completed });
  if (reliability && reliability.onTimeAnswered > 0) signals.push({ key: "trust.onTime", n: reliability.onTimeCount, total: reliability.onTimeAnswered });
  if (bestAnswers > 0) signals.push({ key: "trust.bestAnswers", n: bestAnswers });
  if (disputed > 0) signals.push({ key: "trust.openDisputes", n: disputed });
  return signals;
}
