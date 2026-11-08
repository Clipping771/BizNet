import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { putFile, getFile, fileExists, storageHealth } from "@/lib/storage";

const prisma = new PrismaClient();
const KEY = `private/verification/test-db-driver/${Date.now()}-licence.pdf`;

describe("STORAGE_DRIVER=database keeps files in Postgres", () => {
  const saved = process.env.STORAGE_DRIVER;

  beforeAll(() => {
    process.env.STORAGE_DRIVER = "database";
  });

  afterAll(async () => {
    await prisma.storedFile.deleteMany({ where: { key: { startsWith: "private/verification/test-db-driver/" } } });
    if (saved === undefined) delete process.env.STORAGE_DRIVER;
    else process.env.STORAGE_DRIVER = saved;
    await prisma.$disconnect();
  });

  it("stores, finds, reads back and replaces a file", async () => {
    expect(await fileExists(KEY)).toBe(false);
    expect(await getFile(KEY)).toBeNull();

    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x10]);
    await putFile(KEY, bytes, "application/pdf", true);

    expect(await fileExists(KEY)).toBe(true);
    const got = await getFile(KEY);
    expect(got?.contentType).toBe("application/pdf");
    expect(Buffer.compare(got!.buffer, bytes)).toBe(0);

    // The row lives in the database, so it outlives the process
    const row = await prisma.storedFile.findUnique({ where: { key: KEY } });
    expect(row).toMatchObject({ isPrivate: true, sizeBytes: bytes.length });

    await putFile(KEY, Buffer.from("v2"), "image/png", false);
    const replaced = await getFile(KEY, false);
    expect(replaced?.buffer.toString()).toBe("v2");
    expect(replaced?.contentType).toBe("image/png");
  });

  it("reports database storage in the health check", async () => {
    expect(await storageHealth()).toBe("database");
  });
});
