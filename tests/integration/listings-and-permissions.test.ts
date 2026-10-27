import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, PlatformRole, MemberRole, VerificationStatus } from "@prisma/client";
import { assertCan, AuthorizationError } from "@/lib/authz";
import {
  createListing,
  updateListing,
  deleteListing,
  getPublicListingById,
  getPublicBusinessBySlug,
  ListingNotFoundError,
  ListingError,
} from "@/lib/repo/listing";

const prisma = new PrismaClient();

describe("Phase 2 - C. Listings & D. Public Pages (§7)", () => {
  let supplierOwner: any;
  let supplierManager: any;
  let supplierStaff: any;
  let buyerOwner: any;
  let otherSupplierOwner: any;

  let verifiedSupplierBiz: any;
  let unverifiedSupplierBiz: any;
  let suspendedSupplierBiz: any;
  let buyerBiz: any;
  let otherSupplierBiz: any;

  let containersCategory: any;
  let foodBoxesCategory: any;

  beforeAll(async () => {
    // 1. Fetch categories
    containersCategory = await prisma.category.findUnique({
      where: { slug: "containers" },
    });
    foodBoxesCategory = await prisma.category.findUnique({
      where: { slug: "food_boxes" },
    });

    // 2. Setup Users
    supplierOwner = await prisma.user.create({
      data: {
        phone: `+8801788880001-${Date.now()}`,
        name: "Verified Supplier Owner",
        role: PlatformRole.USER,
        phoneVerified: true,
      },
    });

    supplierManager = await prisma.user.create({
      data: {
        phone: `+8801788880002-${Date.now()}`,
        name: "Verified Supplier Manager",
        role: PlatformRole.USER,
        phoneVerified: true,
      },
    });

    supplierStaff = await prisma.user.create({
      data: {
        phone: `+8801788880003-${Date.now()}`,
        name: "Verified Supplier Staff",
        role: PlatformRole.USER,
        phoneVerified: true,
      },
    });

    buyerOwner = await prisma.user.create({
      data: {
        phone: `+8801788880004-${Date.now()}`,
        name: "Buyer Restaurant Owner",
        role: PlatformRole.USER,
        phoneVerified: true,
      },
    });

    otherSupplierOwner = await prisma.user.create({
      data: {
        phone: `+8801788880005-${Date.now()}`,
        name: "Other Supplier Owner",
        role: PlatformRole.USER,
        phoneVerified: true,
      },
    });

    // 3. Setup Businesses
    verifiedSupplierBiz = await prisma.business.create({
      data: {
        slug: `verified-sup-${Date.now()}`,
        name: "পদ্মা প্যাকেজিং ইন্ডাস্ট্রিজ",
        businessType: "Packaging Manufacturer",
        isSupplier: true,
        isBuyer: false,
        area: "Chawkbazar",
        city: "Dhaka",
        addressLine: "Chawkbazar Main Road",
        phonePublic: "+8801788880001",
        whatsapp: "+8801788880001",
        verificationStatus: VerificationStatus.BASIC,
        verifiedAt: new Date(),
      },
    });

    unverifiedSupplierBiz = await prisma.business.create({
      data: {
        slug: `unverified-sup-${Date.now()}`,
        name: "মেঘনা প্লাস্টিক",
        businessType: "Packaging Supplier",
        isSupplier: true,
        isBuyer: false,
        area: "Keraniganj",
        city: "Dhaka",
        addressLine: "Keraniganj, Dhaka",
        verificationStatus: VerificationStatus.UNVERIFIED,
      },
    });

    suspendedSupplierBiz = await prisma.business.create({
      data: {
        slug: `suspended-sup-${Date.now()}`,
        name: "স্থগিত প্যাকেজিং",
        businessType: "Packaging Supplier",
        isSupplier: true,
        isBuyer: false,
        area: "Mirpur",
        city: "Dhaka",
        addressLine: "Mirpur 10, Dhaka",
        verificationStatus: VerificationStatus.SUSPENDED,
        isSuspended: true,
      },
    });

    buyerBiz = await prisma.business.create({
      data: {
        slug: `buyer-cafe-${Date.now()}`,
        name: "কাফে ধানমন্ডি",
        businessType: "Restaurant",
        isSupplier: false,
        isBuyer: true,
        area: "Dhanmondi",
        city: "Dhaka",
        addressLine: "Road 4A, Dhanmondi",
        verificationStatus: VerificationStatus.BASIC,
      },
    });

    otherSupplierBiz = await prisma.business.create({
      data: {
        slug: `other-sup-${Date.now()}`,
        name: "অন্যতম কার্টন ফ্যাক্টরি",
        businessType: "Packaging Supplier",
        isSupplier: true,
        isBuyer: false,
        area: "Gazipur",
        city: "Gazipur",
        addressLine: "Board Bazar, Gazipur",
        verificationStatus: VerificationStatus.BASIC,
      },
    });

    // 4. Attach Memberships
    await prisma.membership.createMany({
      data: [
        { userId: supplierOwner.id, businessId: verifiedSupplierBiz.id, role: MemberRole.OWNER },
        { userId: supplierManager.id, businessId: verifiedSupplierBiz.id, role: MemberRole.MANAGER },
        { userId: supplierStaff.id, businessId: verifiedSupplierBiz.id, role: MemberRole.STAFF },
        { userId: buyerOwner.id, businessId: buyerBiz.id, role: MemberRole.OWNER },
        { userId: otherSupplierOwner.id, businessId: otherSupplierBiz.id, role: MemberRole.OWNER },
      ],
    });
  });

  afterAll(async () => {
    // Targeted clean up without empty deleteMany
    const bizIds = [
      verifiedSupplierBiz.id,
      unverifiedSupplierBiz.id,
      suspendedSupplierBiz.id,
      buyerBiz.id,
      otherSupplierBiz.id,
    ];

    await prisma.auditLog.deleteMany({
      where: { actorBusinessId: { in: bizIds } },
    });
    await prisma.listing.deleteMany({
      where: { businessId: { in: bizIds } },
    });
    await prisma.membership.deleteMany({
      where: { businessId: { in: bizIds } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: bizIds } },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            supplierOwner.id,
            supplierManager.id,
            supplierStaff.id,
            buyerOwner.id,
            otherSupplierOwner.id,
          ],
        },
      },
    });
    await prisma.$disconnect();
  });

  describe("C2 & C3: Permissions Table Tests for Listings", () => {
    it("allows OWNER of verified supplier (BASIC) to create listings", () => {
      const ctx = {
        userId: supplierOwner.id,
        role: PlatformRole.USER,
        activeBusinessId: verifiedSupplierBiz.id,
        businessRole: MemberRole.OWNER,
      };

      expect(() =>
        assertCan(ctx, "listing:create", {
          businessId: verifiedSupplierBiz.id,
          isSupplier: true,
          verificationStatus: "BASIC",
          isSuspended: false,
        })
      ).not.toThrow();
    });

    it("allows MANAGER of verified supplier to create/edit listings", () => {
      const ctx = {
        userId: supplierManager.id,
        role: PlatformRole.USER,
        activeBusinessId: verifiedSupplierBiz.id,
        businessRole: MemberRole.MANAGER,
      };

      expect(() =>
        assertCan(ctx, "listing:create", {
          businessId: verifiedSupplierBiz.id,
          isSupplier: true,
          verificationStatus: "BASIC",
          isSuspended: false,
        })
      ).not.toThrow();
    });

    it("denies STAFF of supplier from managing listings", () => {
      const ctx = {
        userId: supplierStaff.id,
        role: PlatformRole.USER,
        activeBusinessId: verifiedSupplierBiz.id,
        businessRole: MemberRole.STAFF,
      };

      expect(() =>
        assertCan(ctx, "listing:create", {
          businessId: verifiedSupplierBiz.id,
          isSupplier: true,
          verificationStatus: "BASIC",
          isSuspended: false,
        })
      ).toThrow("Only OWNER or MANAGER can manage listings");
    });

    it("denies OWNER of UNVERIFIED supplier from creating listings", () => {
      const ctx = {
        userId: supplierOwner.id,
        role: PlatformRole.USER,
        activeBusinessId: unverifiedSupplierBiz.id,
        businessRole: MemberRole.OWNER,
      };

      expect(() =>
        assertCan(ctx, "listing:create", {
          businessId: unverifiedSupplierBiz.id,
          isSupplier: true,
          verificationStatus: "UNVERIFIED",
          isSuspended: false,
        })
      ).toThrow("Business must be BASIC or VERIFIED to manage listings");
    });

    it("denies OWNER of SUSPENDED supplier from managing listings", () => {
      const ctx = {
        userId: supplierOwner.id,
        role: PlatformRole.USER,
        activeBusinessId: suspendedSupplierBiz.id,
        businessRole: MemberRole.OWNER,
      };

      expect(() =>
        assertCan(ctx, "listing:create", {
          businessId: suspendedSupplierBiz.id,
          isSupplier: true,
          verificationStatus: "BASIC",
          isSuspended: true,
        })
      ).toThrow("Suspended suppliers cannot manage listings");
    });

    it("denies buyer-only business from creating listings", () => {
      const ctx = {
        userId: buyerOwner.id,
        role: PlatformRole.USER,
        activeBusinessId: buyerBiz.id,
        businessRole: MemberRole.OWNER,
      };

      expect(() =>
        assertCan(ctx, "listing:create", {
          businessId: buyerBiz.id,
          isSupplier: false,
          verificationStatus: "BASIC",
          isSuspended: false,
        })
      ).toThrow("Only suppliers can manage listings");
    });
  });

  describe("C1, C4, C5: Listing CRUD, Search Vector Trigger & IDOR Protection", () => {
    let createdListing: any;

    it("C1 & C4: creates listing, validates attributes, and triggers search_vector update", async () => {
      createdListing = await createListing(verifiedSupplierBiz.id, {
        categoryId: containersCategory.id,
        title: "প্রিমিয়াম ফুড কন্টেইনার ৫০০ মিলি",
        description: "মাইক্রোওয়েভ ওভেন ফ্রেন্ডলি ঢাকনাসহ প্লাস্টিক বক্স",
        unit: "pcs",
        priceMin: 4.5,
        priceMax: 6.0,
        moq: 500,
        leadTimeDays: 2,
        attributes: {
          material: "plastic_pp",
          capacity_ml: 500,
          has_lid: true,
          microwave_safe: true,
        },
      });

      expect(createdListing.id).toBeDefined();
      expect(createdListing.title).toBe("প্রিমিয়াম ফুড কন্টেইনার ৫০০ মিলি");
      expect(createdListing.attributes.capacity_ml).toBe(500);

      // C4: search_vector trigger verification
      const rawRows: any[] = await prisma.$queryRaw`
        SELECT search_vector::text as sv
        FROM "Listing"
        WHERE id = ${createdListing.id}
      `;
      expect(rawRows.length).toBe(1);
      expect(rawRows[0].sv).toContain("কন্টেইনার");
    });

    it("C1 & C4: updates listing and updates search_vector", async () => {
      const updated = await updateListing(verifiedSupplierBiz.id, createdListing.id, {
        title: "সুপার কোয়ালিটি প্লাস্টিক কন্টেইনার",
        priceMin: 5.0,
      });

      expect(updated.title).toBe("সুপার কোয়ালিটি প্লাস্টিক কন্টেইনার");

      const rawRows: any[] = await prisma.$queryRaw`
        SELECT search_vector::text as sv
        FROM "Listing"
        WHERE id = ${createdListing.id}
      `;
      expect(rawRows[0].sv).toContain("সুপার");
    });

    it("C5: IDOR protection - other business cannot edit or delete listing", async () => {
      // otherSupplierBiz attempts to update verifiedSupplierBiz's listing
      await expect(
        updateListing(otherSupplierBiz.id, createdListing.id, {
          title: "Hacked Title",
        })
      ).rejects.toThrow("Listing not found or access denied");

      // otherSupplierBiz attempts to delete verifiedSupplierBiz's listing
      await expect(
        deleteListing(otherSupplierBiz.id, createdListing.id)
      ).rejects.toThrow("Listing not found or access denied");

      // Verify listing title was not altered
      const current = await prisma.listing.findUnique({
        where: { id: createdListing.id },
      });
      expect(current?.title).toBe("সুপার কোয়ালিটি প্লাস্টিক কন্টেইনার");
    });

    it("C1: deletes listing via soft delete (isActive: false, deletedAt set)", async () => {
      const deleted = await deleteListing(verifiedSupplierBiz.id, createdListing.id);
      expect(deleted.isActive).toBe(false);
      expect(deleted.deletedAt).not.toBeNull();
    });
  });

  describe("D1, D2, D3: Public Pages, Phone Masking & Visibility", () => {
    let publicListing: any;

    beforeAll(async () => {
      publicListing = await createListing(verifiedSupplierBiz.id, {
        categoryId: containersCategory.id,
        title: "ডিসপোজেবল প্লাস্টিক কাপ ২৫০ মিলি",
        description: "চা কফি ও কোল্ড ড্রিংকসের কাপ",
        unit: "box",
        priceMin: 250,
        priceMax: 300,
        moq: 10,
        leadTimeDays: 1,
        attributes: {
          material: "plastic_pp",
          capacity_ml: 250,
          has_lid: false,
          microwave_safe: false,
        },
      });
    });

    it("D1: public business profile never exposes phonePublic or whatsapp", async () => {
      const publicBiz = await getPublicBusinessBySlug(verifiedSupplierBiz.slug);
      expect(publicBiz).not.toBeNull();
      expect(publicBiz?.name).toBe("পদ্মা প্যাকেজিং ইন্ডাস্ট্রিজ");
      expect(publicBiz?.verificationStatus).toBe(VerificationStatus.BASIC);

      // Verify phonePublic and whatsapp are strictly undefined in the public object
      expect((publicBiz as any).phonePublic).toBeUndefined();
      expect((publicBiz as any).whatsapp).toBeUndefined();

      // Active listings are included
      expect(publicBiz?.listings.length).toBeGreaterThan(0);
      expect(publicBiz?.listings[0].title).toBe("ডিসপোজেবল প্লাস্টিক কাপ ২৫০ মিলি");
    });

    it("D2: public listing page is accessible without auth and contains formatted attributes & badge", async () => {
      const pubListing = await getPublicListingById(publicListing.id);
      expect(pubListing).not.toBeNull();
      expect(pubListing?.title).toBe("ডিসপোজেবল প্লাস্টিক কাপ ২৫০ মিলি");
      expect(pubListing?.business.name).toBe("পদ্মা প্যাকেজিং ইন্ডাস্ট্রিজ");
      expect(pubListing?.business.verificationStatus).toBe(VerificationStatus.BASIC);

      // Verify attributes
      expect((pubListing?.attributes as any).material).toBe("plastic_pp");
      expect((pubListing?.attributes as any).capacity_ml).toBe(250);

      // Phone numbers not leaked in business relation
      expect((pubListing?.business as any).phonePublic).toBeUndefined();
      expect((pubListing?.business as any).whatsapp).toBeUndefined();
    });

    it("D3: suspended business profile returns null (404)", async () => {
      const res = await getPublicBusinessBySlug(suspendedSupplierBiz.slug);
      expect(res).toBeNull();
    });

    it("D3: inactive or deleted listing returns null (404)", async () => {
      // Soft-delete the listing
      await deleteListing(verifiedSupplierBiz.id, publicListing.id);

      const res = await getPublicListingById(publicListing.id);
      expect(res).toBeNull();
    });
  });
});
