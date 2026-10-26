import { prisma } from "../prisma";
import { AuditLog } from "@prisma/client";

export async function createAuditRecord(data: {
  actorUserId?: string | null;
  actorBusinessId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: any;
  after?: any;
  ip?: string | null;
}): Promise<AuditLog> {
  return prisma.auditLog.create({
    data: {
      actorUserId: data.actorUserId ?? null,
      actorBusinessId: data.actorBusinessId ?? null,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      before: data.before,
      after: data.after,
      ip: data.ip ?? null,
    },
  });
}
