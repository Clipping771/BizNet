import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("Phase 1: Search Triggers & Database Verification", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should have populated search_vector automatically on Listing insert/update", async () => {
    // 1. Find a category
    const category = await prisma.category.findFirst({ where: { slug: "containers" } });
    expect(category).toBeDefined();

    // 2. Find a business
    const business = await prisma.business.findFirst({ where: { isSupplier: true } });
    expect(business).toBeDefined();

    // 3. Create a listing
    const listing = await prisma.listing.create({
      data: {
        businessId: business!.id,
        categoryId: category!.id,
        title: "টেস্ট ফুড কন্টেইনার ৫০০ মিলি",
        description: "মাইক্রোওয়েভ ফ্রেন্ডলি ঢাকনাসহ বক্স",
        unit: "pcs",
        attributes: { capacity_ml: 500, has_lid: true },
      },
    });

    // 4. Query raw search_vector
    const rows: any[] = await prisma.$queryRaw`
      SELECT id, search_vector::text as sv
      FROM "Listing"
      WHERE id = ${listing.id};
    `;

    expect(rows.length).toBe(1);
    expect(rows[0].sv).toBeDefined();
    // Simple dictionary unaccented stem should contain parts of title
    expect(rows[0].sv).toContain("টেস্ট");

    // Clean up
    await prisma.listing.delete({ where: { id: listing.id } });
  });

  it("should have populated search_vector on Business", async () => {
    const business = await prisma.business.create({
      data: {
        slug: `test-search-biz-${Date.now()}`,
        name: "পদ্মা প্যাকেজিং এন্টারপ্রাইজ",
        description: "পাইকারি কার্টুন ও বক্স",
        businessType: "Packaging Supplier",
        area: "Chawkbazar",
        city: "Dhaka",
        addressLine: "Chawkbazar, Dhaka",
      },
    });

    const rows: any[] = await prisma.$queryRaw`
      SELECT id, search_vector::text as sv
      FROM "Business"
      WHERE id = ${business.id};
    `;

    expect(rows.length).toBe(1);
    expect(rows[0].sv).toContain("পদ্মা");
    expect(rows[0].sv).toContain("chawkbazar");

    await prisma.business.delete({ where: { id: business.id } });
  });

  it("should have populated search_vector on Question", async () => {
    const user = await prisma.user.findFirst();
    expect(user).toBeDefined();

    const question = await prisma.question.create({
      data: {
        authorUserId: user!.id,
        title: "কাগজের ব্যাগের মূল্য কেমন?",
        body: "বর্তমানে বাজারে ৫০০ পিস ক্রাফট ব্যাগের পাইকারি দর জানতে চাই।",
      },
    });

    const rows: any[] = await prisma.$queryRaw`
      SELECT id, search_vector::text as sv
      FROM "Question"
      WHERE id = ${question.id};
    `;

    expect(rows.length).toBe(1);
    expect(rows[0].sv).toContain("কাগজের");

    await prisma.question.delete({ where: { id: question.id } });
  });

  it("should rank exact Bangla matches higher using ts_rank over search_vector", async () => {
    const biz1 = await prisma.business.create({
      data: {
        slug: `search-rank-exact-${Date.now()}`,
        name: "প্রিমিয়াম প্লাস্টিক বক্স লিমিটেড",
        description: "প্লাস্টিক বক্স পাইকারি সরবরাহকারী",
        businessType: "Packaging Supplier",
        area: "Mirpur",
        city: "Dhaka",
        addressLine: "Mirpur-10, Dhaka",
      },
    });

    const biz2 = await prisma.business.create({
      data: {
        slug: `search-rank-other-${Date.now()}`,
        name: "সাধারণ কার্টুন কারখানা",
        description: "এখানে অন্যান্য সামগ্রী পাওয়া যায়",
        businessType: "Packaging Supplier",
        area: "Mirpur",
        city: "Dhaka",
        addressLine: "Mirpur-2, Dhaka",
      },
    });

    const rows: any[] = await prisma.$queryRaw`
      SELECT id, name, ts_rank(search_vector, plainto_tsquery('simple', unaccent('প্লাস্টিক'))) as rank
      FROM "Business"
      WHERE id IN (${biz1.id}, ${biz2.id})
      ORDER BY rank DESC;
    `;

    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe(biz1.id);
    expect(Number(rows[0].rank)).toBeGreaterThan(0);
    expect(Number(rows[1].rank)).toBe(0);

    await prisma.business.deleteMany({ where: { id: { in: [biz1.id, biz2.id] } } });
  });
});
