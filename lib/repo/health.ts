import { prisma } from "@/lib/prisma";

export async function databaseHealth(): Promise<"ok"> {
  await prisma.$queryRaw`SELECT 1`;
  return "ok";
}

/** "ok" once the pg-boss worker has created its schema, otherwise "not-started". */
export async function queueHealth(): Promise<"ok" | "not-started"> {
  const rows = await prisma.$queryRaw<Array<{ t: string | null }>>`SELECT to_regclass('pgboss.job')::text AS t`;
  return rows[0]?.t ? "ok" : "not-started";
}
