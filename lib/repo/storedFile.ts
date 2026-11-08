import { prisma } from "@/lib/prisma";

/** Files kept in Postgres when STORAGE_DRIVER=database (see lib/storage). */
export async function saveStoredFile(key: string, data: Buffer, contentType: string, isPrivate: boolean) {
  const bytes = new Uint8Array(data);
  await prisma.storedFile.upsert({
    where: { key },
    create: { key, isPrivate, contentType, sizeBytes: data.length, data: bytes },
    update: { isPrivate, contentType, sizeBytes: data.length, data: bytes },
  });
}

export async function storedFileExists(key: string): Promise<boolean> {
  return (await prisma.storedFile.count({ where: { key } })) > 0;
}

export async function readStoredFile(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const row = await prisma.storedFile.findUnique({ where: { key }, select: { data: true, contentType: true } });
  return row ? { buffer: Buffer.from(row.data), contentType: row.contentType } : null;
}

/** Throws when the table cannot be reached. */
export async function storedFilesHealth(): Promise<void> {
  await prisma.storedFile.findFirst({ select: { key: true } });
}
