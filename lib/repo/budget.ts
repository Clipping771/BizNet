import { prisma } from "../prisma";

export async function executeAtomicBudgetReservation(
  scope: string,
  today: string,
  maxCost: number,
  cap: number
): Promise<boolean> {
  const query = `
    INSERT INTO "AiBudgetCounter" ("scope", "day", "spentUsd", "calls")
    SELECT $1, $2::date, $3, 1
    WHERE $3 <= $4
    ON CONFLICT ("scope", "day")
    DO UPDATE SET
      "spentUsd" = "AiBudgetCounter"."spentUsd" + $3,
      "calls" = "AiBudgetCounter"."calls" + 1
    WHERE "AiBudgetCounter"."spentUsd" + $3 <= $4
    RETURNING *;
  `;

  const res: any[] = await prisma.$queryRawUnsafe(query, scope, today, maxCost, cap);
  return Boolean(res && res.length > 0);
}

export async function executeBudgetRefund(
  refund: number,
  scope: string,
  day: string
): Promise<void> {
  const refundQuery = `
    UPDATE "AiBudgetCounter"
    SET "spentUsd" = GREATEST(0, "spentUsd" - $1)
    WHERE "scope" = $2 AND "day" = $3::date;
  `;
  await prisma.$executeRawUnsafe(refundQuery, refund, scope, day);
}
