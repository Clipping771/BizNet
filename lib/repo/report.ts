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

export async function listConciergeZeroMatchQueue() {
  return prisma.report.findMany({
    where: {
      targetType: "REQUEST_ZERO_MATCH",
      status: ReportStatus.OPEN,
    },
    orderBy: { createdAt: "desc" },
  });
}
