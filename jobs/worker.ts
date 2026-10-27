/**
 * jobs/worker.ts — background worker (pg-boss on Postgres, no Redis; §3).
 *
 * Run alongside the web app: `pnpm worker`. Schedules (Asia/Dhaka):
 * - expire-requests       every 15 minutes (§8.5)
 * - auto-complete-orders  hourly; completes orders delivered ≥ 7 days ago (§8.9)
 * - compute-market-prices nightly at 02:00 (§8.15)
 * No AI runs in background jobs (§12).
 */

import PgBoss from "pg-boss";
import { runExpireRequestsJob } from "./expire-requests";
import { runAutoCompleteOrdersJob } from "./auto-complete-orders";
import { runComputeMarketPricesJob } from "./compute-market-prices";

export const SCHEDULES: Array<{ name: string; cron: string; run: () => Promise<unknown> }> = [
  { name: "expire-requests", cron: "*/15 * * * *", run: () => runExpireRequestsJob() },
  { name: "auto-complete-orders", cron: "0 * * * *", run: () => runAutoCompleteOrdersJob() },
  { name: "compute-market-prices", cron: "0 2 * * *", run: () => runComputeMarketPricesJob() },
];

export async function startWorker(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required for the worker");
  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (err) => console.error("[worker] pg-boss error:", err));
  await boss.start();

  for (const job of SCHEDULES) {
    await boss.createQueue(job.name);
    await boss.schedule(job.name, job.cron, {}, { tz: "Asia/Dhaka" });
    await boss.work(job.name, async () => {
      const started = Date.now();
      const result = await job.run();
      console.log(`[worker] ${job.name} done in ${Date.now() - started} ms`, JSON.stringify(result));
    });
  }
  console.log(`[worker] started: ${SCHEDULES.map((j) => `${j.name} (${j.cron})`).join(", ")}`);
  return boss;
}

if (require.main === module) {
  startWorker()
    .then((boss) => {
      const stop = async () => {
        await boss.stop({ graceful: true });
        process.exit(0);
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    })
    .catch((err) => {
      console.error("[worker] failed to start:", err);
      process.exit(1);
    });
}
