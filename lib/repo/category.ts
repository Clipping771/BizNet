/**
 * lib/repo/category.ts
 *
 * Repository for Categories (§8.3, §8.4)
 */

import { prisma } from "@/lib/prisma";

export const DEFAULT_CATEGORIES = [
  {
    slug: "containers",
    defaultUnits: ["pcs", "box"],
    sortOrder: 1,
    attributeSchema: {
      fields: [
        { key: "material", type: "select", required: true, filterable: true, comparable: true, options: ["plastic_pp", "paper", "aluminium"] },
        { key: "capacity_ml", type: "number", min: 0, unit: "ml", filterable: true, comparable: true },
        { key: "has_lid", type: "boolean", filterable: true, comparable: true },
        { key: "microwave_safe", type: "boolean", filterable: true, comparable: true },
      ],
    },
  },
  {
    slug: "food_boxes",
    defaultUnits: ["pcs", "box"],
    sortOrder: 2,
    attributeSchema: {
      fields: [
        { key: "material", type: "select", required: true, filterable: true, comparable: true, options: ["paper", "kraft", "plastic_pp", "aluminium", "foam"] },
        { key: "size", type: "text", comparable: true },
        { key: "compartments", type: "number", min: 1, filterable: true, comparable: true },
        { key: "has_lid", type: "boolean", filterable: true, comparable: true },
        { key: "printing", type: "select", options: ["none", "custom_logo"], comparable: true },
      ],
    },
  },
  {
    slug: "carry_bags",
    defaultUnits: ["pcs", "pack"],
    sortOrder: 3,
    attributeSchema: {
      fields: [
        { key: "material", type: "select", required: true, filterable: true, comparable: true, options: ["paper", "kraft", "plastic_pp"] },
        { key: "size", type: "text", comparable: true },
        { key: "handle_type", type: "select", options: ["none", "loop", "die_cut", "twisted"], comparable: true },
        { key: "printing", type: "select", options: ["none", "custom_logo"], comparable: true },
      ],
    },
  },
  {
    slug: "cups",
    defaultUnits: ["pcs", "box"],
    sortOrder: 4,
    attributeSchema: {
      fields: [
        { key: "material", type: "select", required: true, filterable: true, comparable: true, options: ["paper", "plastic_pp"] },
        { key: "capacity_ml", type: "number", min: 0, unit: "ml", filterable: true, comparable: true },
        { key: "has_lid", type: "boolean", filterable: true, comparable: true },
      ],
    },
  },
  {
    slug: "tissue",
    defaultUnits: ["pack", "box"],
    sortOrder: 5,
    attributeSchema: {
      fields: [
        { key: "ply", type: "number", min: 1, filterable: true, comparable: true },
        { key: "sheets_per_pack", type: "number", min: 1, filterable: true, comparable: true },
      ],
    },
  },
  {
    slug: "cutlery",
    defaultUnits: ["pcs", "set", "pack"],
    sortOrder: 6,
    attributeSchema: {
      fields: [
        { key: "material", type: "select", required: true, filterable: true, comparable: true, options: ["plastic_pp", "wood"] },
        { key: "item_type", type: "select", options: ["spoon", "fork", "knife", "set"], filterable: true, comparable: true },
      ],
    },
  },
  {
    slug: "foil_wrap",
    defaultUnits: ["roll", "box"],
    sortOrder: 7,
    attributeSchema: {
      fields: [
        { key: "width_cm", type: "number", min: 10, filterable: true, comparable: true },
        { key: "length_m", type: "number", min: 1, filterable: true, comparable: true },
      ],
    },
  },
  {
    slug: "other",
    defaultUnits: ["pcs", "pack", "box"],
    sortOrder: 8,
    attributeSchema: {
      fields: [],
    },
  },
];

async function ensureDefaultCategories() {
  for (const c of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        slug: c.slug,
        defaultUnits: c.defaultUnits,
        sortOrder: c.sortOrder,
        attributeSchema: c.attributeSchema,
        isActive: true,
      },
    });
  }
}

export async function listActiveCategories() {
  let categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  if (categories.length === 0) {
    await ensureDefaultCategories();
    categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  return categories;
}

export async function findCategoryBySlug(slug: string) {
  let category = await prisma.category.findUnique({
    where: { slug },
  });

  if (!category) {
    const defaultDef = DEFAULT_CATEGORIES.find((c) => c.slug === slug);
    if (defaultDef) {
      await ensureDefaultCategories();
      category = await prisma.category.findUnique({
        where: { slug },
      });
    }
  }

  return category;
}

export async function findCategoryById(id: string) {
  return prisma.category.findUnique({
    where: { id },
  });
}
