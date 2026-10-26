import { createAuditRecord } from "./repo/audit";

export interface LogAuditOptions {
  actorUserId?: string | null;
  actorBusinessId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: any;
  after?: any;
  ip?: string | null;
}

export async function logAudit(options: LogAuditOptions): Promise<void> {
  try {
    await createAuditRecord(options);
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}
