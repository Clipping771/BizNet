/**
 * lib/repo/category.ts
 *
 * Repository for Categories (§8.3, §8.4)
 */

import { prisma } from "@/lib/prisma";

export async function listActiveCategories() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function findCategoryBySlug(slug: string) {
  return prisma.category.findUnique({
    where: { slug },
  });
}

export async function findCategoryById(id: string) {
  return prisma.category.findUnique({
    where: { id },
  });
}
