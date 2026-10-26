import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  reserveAiBudget,
  refundAiBudget,
  calculateMaxCost,
} from "../../lib/ai/budget";
import { getSetting, updateSetting } from "../../lib/settings";

const prisma = new PrismaClient();

describe("Phase 1: Atomic AI Budget & Concurrency Tests", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("(a) 50 parallel calls against a cap allowing 10 → at most 10 succeed", async () => {
    const today = new Date().toISOString().split("T")[0];
    const testUserId = `test-user-concurrency-${Date.now()}`;
    const testScope = `user:${testUserId}`;

    // Clean up counter for test
    await prisma.$executeRawUnsafe(
      `DELETE FROM "AiBudgetCounter" WHERE "scope" = $1 AND "day" = $2::date;`,
      testScope,
      today
    );

    // Each call has maxCost = $0.10
    // We set cap allowing exactly 10 calls = $1.00
    const inPrice = 0.0001; // $0.10 per call for 1000 tokens
    const maxOutputTokens = 1000;
    const singleCallCost = calculateMaxCost(maxOutputTokens, 0, inPrice, inPrice);
    expect(singleCallCost).toBe(0.1);

    const userDailyCap = 1.0; // allows exactly 10 calls

    // Fire 50 parallel reservation requests
    const promises = Array.from({ length: 50 }).map(() =>
      reserveAiBudget({
        userId: testUserId,
        maxOutputTokens,
        inputTokensUpperBound: 0,
        inPricePerToken: inPrice,
        outPricePerToken: inPrice,
        userDailyCap,
        globalDailyCap: 1000.0,
      })
    );

    const results = await Promise.all(promises);

    const succeeded = results.filter((r) => r.reserved);
    const failed = results.filter((r) => !r.reserved);

    expect(succeeded.length).toBeLessThanOrEqual(10);
    expect(succeeded.length).toBe(10);
    expect(failed.length).toBe(40);

    // Check spentUsd in DB: should be exactly $1.00
    const counter: any[] = await prisma.$queryRawUnsafe(
      `SELECT "spentUsd"::float as spent, "calls" FROM "AiBudgetCounter" WHERE "scope" = $1 AND "day" = $2::date;`,
      testScope,
      today
    );
    expect(counter.length).toBe(1);
    expect(counter[0].spent).toBeCloseTo(1.0, 4);
    expect(counter[0].calls).toBe(10);
  });

  it("(b) after refunds, spentUsd equals the sum of actual costs", async () => {
    const today = new Date().toISOString().split("T")[0];
    const testUserId = `test-user-refund-${Date.now()}`;
    const testScope = `user:${testUserId}`;

    // Clean up
    await prisma.$executeRawUnsafe(
      `DELETE FROM "AiBudgetCounter" WHERE "scope" = $1 AND "day" = $2::date;`,
      testScope,
      today
    );

    // Reserve with maxCost = $0.50
    const reservation = await reserveAiBudget({
      userId: testUserId,
      maxOutputTokens: 500,
      inputTokensUpperBound: 500,
      inPricePerToken: 0.0005,
      outPricePerToken: 0.0005,
      userDailyCap: 10.0,
      globalDailyCap: 1000.0,
    });

    expect(reservation.reserved).toBe(true);
    expect(reservation.maxCost).toBe(0.5);

    // Actual cost was only $0.15 (refund $0.35)
    const actualCost = 0.15;
    await refundAiBudget(reservation, actualCost, "REQUEST_ASSISTANT");

    // Verify DB spentUsd equals actualCost
    const counter: any[] = await prisma.$queryRawUnsafe(
      `SELECT "spentUsd"::float as spent FROM "AiBudgetCounter" WHERE "scope" = $1 AND "day" = $2::date;`,
      testScope,
      today
    );
    expect(counter.length).toBe(1);
    expect(counter[0].spent).toBeCloseTo(actualCost, 4);
  });

  it("(c) mock reporting actual > reserved logs BUDGET_OVERRUN and disables the feature for the day", async () => {
    const today = new Date().toISOString().split("T")[0];
    await updateSetting("aiDisabledUntilDay", null);

    const testUserId = `test-user-overrun-${Date.now()}`;

    // Reserve budget with maxCost = $0.10
    const reservation = await reserveAiBudget({
      userId: testUserId,
      maxOutputTokens: 100,
      inputTokensUpperBound: 0,
      inPricePerToken: 0.001,
      outPricePerToken: 0.001,
      userDailyCap: 10.0,
      globalDailyCap: 1000.0,
    });
    expect(reservation.reserved).toBe(true);

    // Simulate provider reporting actualCost > maxCost
    const illegalActualCost = 5.0; // 50x maxCost
    await refundAiBudget(reservation, illegalActualCost, "REQUEST_ASSISTANT");

    // Assert: aiDisabledUntilDay should now be set to today
    const aiDisabledUntilDay = await getSetting("aiDisabledUntilDay");
    expect(aiDisabledUntilDay).toBe(today);

    // Assert: Audit log recorded BUDGET_OVERRUN
    const overrunAudit = await prisma.auditLog.findFirst({
      where: { action: "BUDGET_OVERRUN" },
      orderBy: { createdAt: "desc" },
    });
    expect(overrunAudit).toBeDefined();
    expect(overrunAudit?.entityType).toBe("AI_FEATURE");

    // Subsequent reservation on the same day should be rejected cleanly
    const blockedRes = await reserveAiBudget({
      userId: testUserId,
      maxOutputTokens: 100,
      userDailyCap: 10.0,
      globalDailyCap: 1000.0,
    });
    expect(blockedRes.reserved).toBe(false);
    expect(blockedRes.reason).toContain("temporarily suspended for today");

    // Clean up
    await updateSetting("aiDisabledUntilDay", null);
  });

  it("(d) rolls back global budget reservation when user-scope reservation fails", async () => {
    const today = new Date().toISOString().split("T")[0];
    const testUserId = `test-user-rollback-${Date.now()}`;
    const globalScope = "global";

    // Measure initial global spentUsd
    const initialGlobal: any[] = await prisma.$queryRawUnsafe(
      `SELECT "spentUsd"::float as spent FROM "AiBudgetCounter" WHERE "scope" = $1 AND "day" = $2::date;`,
      globalScope,
      today
    );
    const initialSpent = initialGlobal[0]?.spent ?? 0.0;

    // Call reserveAiBudget with generous global cap ($100) but exhausted user cap ($0.05 vs $0.10 cost)
    const res = await reserveAiBudget({
      userId: testUserId,
      maxOutputTokens: 100,
      inputTokensUpperBound: 0,
      inPricePerToken: 0.001,
      outPricePerToken: 0.001, // cost = $0.10
      globalDailyCap: 1000.0,
      userDailyCap: 0.05, // less than cost, will fail on user scope
    });

    expect(res.reserved).toBe(false);
    expect(res.reason).toContain("Daily AI budget exhausted");

    // Verify: global counter must NOT have leaked any money! It must equal initialSpent!
    const afterGlobal: any[] = await prisma.$queryRawUnsafe(
      `SELECT "spentUsd"::float as spent FROM "AiBudgetCounter" WHERE "scope" = $1 AND "day" = $2::date;`,
      globalScope,
      today
    );
    const afterSpent = afterGlobal[0]?.spent ?? 0.0;
    expect(afterSpent).toBeCloseTo(initialSpent, 4);
  });
});
