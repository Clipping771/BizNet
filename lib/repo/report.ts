/**
 * lib/repo/report.ts
 *
 * Repository for Reports, Moderation, and Zero-match Concierge Queue (§7, §8.12, §12)
 */

import { prisma } from "@/lib/prisma";
import { ReportStatus } from "@prisma/client";

export interface CreateReportInput {
  reporterUserId: string;
  targetType: string;
  targetId: string;
  reason: string;
  details?: string | null;
}

export async function createReportRecord(input: CreateReportInput) {
  return prisma.report.create({
    data: {
      reporterUserId: input.reporterUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details ?? null,
      status: ReportStatus.OPEN,
    },
  });
}

/** Zero-match reports with the request they are about, so an admin sees what is needed rather than an id. */
export async function listConciergeZeroMatchQueue() {
  const reports = await prisma.report.findMany({
    where: {
      targetType: "REQUEST_ZERO_MATCH",
      status: ReportStatus.OPEN,
    },
    orderBy: { createdAt: "desc" },
  });
  const requests = await prisma.request.findMany({
    where: { id: { in: reports.map((r) => r.targetId) } },
    select: { id: true, code: true, title: true, buyerBusiness: { select: { name: true } } },
  });
  const byId = new Map(requests.map((r) => [r.id, r]));
  return reports.map((r) => ({ ...r, request: byId.get(r.targetId) ?? null }));
}
