/**
 * tests/integration/instant.test.ts — the instant answer against the seeded database: real suppliers,
 * real published prices, one line per supplier, nothing from unverified or suspended businesses.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/instant/route";
import { runComputeMarketPricesJob } from "@/jobs/compute-market-prices";

async function ask(q: string) {
  const res = await GET(new NextRequest(`http://localhost:3000/api/instant?q=${encodeURIComponent(q)}`));
  expect(res.status).toBe(200);
  return res.json();
}

describe("Instant answer", () => {
  beforeAll(async () => {
    // Other suites run the price job with their own quotes; this suite reads a fresh published batch
    await runComputeMarketPricesJob();
  });

  it("answers a Banglish need with suppliers, one line each", async () => {
    const answer = await ask("500 ta 750ml container lagbe");
    expect(answer.quantity).toBe(500);
    expect(answer.exact).toBe(true);
    expect(answer.categorySlug).toBe("containers");
    expect(answer.listings.length).toBeGreaterThan(0);
    const suppliers = answer.listings.map((l: any) => l.businessId);
    expect(new Set(suppliers).size).toBe(suppliers.length);
  });

  it("gives the same suppliers for the Bangla wording", async () => {
    const bangla = await ask("৫০০টা ৭৫০ মিলি কন্টেইনার লাগবে");
    expect(bangla.quantity).toBe(500);
    expect(bangla.listings.length).toBeGreaterThan(0);
  });

  it("still finds the product when the need also names a place", async () => {
    const answer = await ask("container Narayanganj");
    expect(answer.listings.length).toBeGreaterThan(0);
    expect(answer.categorySlug).toBe("containers");
  });

  it("does not show a price group for a different size", async () => {
    const answer = await ask("100 ta 999ml container");
    expect(answer.price).toBeNull();
  });

  it("returns nothing for an unknown product or an empty need", async () => {
    expect((await ask("zzqx nothing")).listings).toEqual([]);
    expect((await ask("lagbe")).listings).toEqual([]);
    expect((await ask("a")).listings).toEqual([]);
  });

  it("never lists a suspended supplier", async () => {
    const before = await ask("750ml container");
    const target = before.listings[0];
    await prisma.business.update({ where: { id: target.businessId }, data: { isSuspended: true } });
    try {
      const after = await ask("750ml container");
      expect(after.listings.map((l: any) => l.businessId)).not.toContain(target.businessId);
    } finally {
      await prisma.business.update({ where: { id: target.businessId }, data: { isSuspended: false } });
    }
  });
});
