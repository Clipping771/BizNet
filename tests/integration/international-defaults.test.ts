import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_CURRENCY, CURRENCIES } from "@/lib/currencies";
import { listSearchAreas } from "@/lib/repo/search";

const prisma = new PrismaClient();

describe("International defaults", () => {
  afterAll(() => prisma.$disconnect());

  it("prices in US dollars unless the supplier chooses otherwise", () => {
    expect(DEFAULT_CURRENCY).toBe("USD");
    expect(CURRENCIES[0]).toBe("USD");
  });

  it("offers the areas public suppliers are really in, each once", async () => {
    const supplier = await prisma.business.findFirstOrThrow({
      where: { isSupplier: true, isSuspended: false, deletedAt: null, verificationStatus: { in: ["BASIC", "VERIFIED"] } },
    });
    const areas = await listSearchAreas(1000);
    expect(areas).toContain(supplier.area);
    expect(new Set(areas).size).toBe(areas.length);
  });
});
