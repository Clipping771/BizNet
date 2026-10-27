import { NextResponse } from "next/server";
import { databaseHealth, queueHealth } from "@/lib/repo/health";
import { storageHealth } from "@/lib/storage";

/** GET /api/health — DB + S3 + queue (§14). 503 when the database or storage is down. */
export async function GET() {
  const check = async <T,>(fn: () => Promise<T>) => {
    try {
      return { ok: true as const, value: await fn() };
    } catch (err) {
      return { ok: false as const, value: (err as Error).name || "error" };
    }
  };
  const [db, storage, queue] = await Promise.all([check(databaseHealth), check(storageHealth), check(queueHealth)]);
  const healthy = db.ok && storage.ok;
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", db: db.value, storage: storage.value, queue: queue.value },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
