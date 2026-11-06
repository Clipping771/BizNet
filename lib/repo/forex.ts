/**
 * lib/repo/forex.ts
 *
 * Repository for Currency exchange rates and forex data.
 */

import { prisma } from "@/lib/prisma";

export async function findCurrencyByCode(code: string) {
  try {
    const client = prisma as any;
    if (!client.currency) return null;
    return await client.currency.findUnique({
      where: { code: code.toUpperCase() },
    });
  } catch {
    return null;
  }
}
