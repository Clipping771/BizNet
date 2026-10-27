import { prisma } from "@/lib/prisma";

export async function logOpsTime(params: {
  userId: string;
  activity: string;
  minutes: number;
  refType?: string | null;
  refId?: string | null;
}) {
  const { userId, activity, minutes, refType, refId } = params;

  if (!activity || activity.trim().length === 0) {
    throw new Error("Activity name is required");
  }

  if (!minutes || minutes <= 0 || !Number.isInteger(minutes)) {
    throw new Error("Minutes must be a positive integer");
  }

  return prisma.opsTimeLog.create({
    data: {
      userId,
      activity: activity.trim(),
      minutes,
      refType: refType || null,
      refId: refId || null,
    },
  });
}

export async function getRecentOpsTimeLogs(limit: number = 50) {
  return prisma.opsTimeLog.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { id: true, name: true, phone: true, email: true },
      },
    },
  });
}

export async function getTotalOpsMinutes(): Promise<number> {
  const aggregate = await prisma.opsTimeLog.aggregate({
    _sum: {
      minutes: true,
    },
  });
  return aggregate._sum.minutes || 0;
}
