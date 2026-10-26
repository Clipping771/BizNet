import { prisma } from "../prisma";
import { Setting } from "@prisma/client";

export async function findSettingByKey(key: string): Promise<Setting | null> {
  return prisma.setting.findUnique({
    where: { key },
  });
}

export async function upsertSettingRecord(key: string, value: any): Promise<Setting> {
  return prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
