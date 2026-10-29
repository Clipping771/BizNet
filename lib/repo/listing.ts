import { prisma } from "@/lib/prisma";
import { validateListingAttributes, AttributeSchema } from "@/lib/attributes";
import { Decimal } from "@prisma/client/runtime/library";
import { VerificationStatus } from "@prisma/client";
import { listActiveCategories } from "@/lib/repo/category";

export class ListingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListingError";
  }
}

export class ListingNotFoundError extends Error {
  constructor(message: string = "Listing not found") {
    super(message);
    this.name = "ListingNotFoundError";
  }
}

export interface ListingInputData {
  categoryId: string;
  title: string;
  description?: string | null;
  unit: string;
  priceMin?: number | null;
  priceMax?: number | null;
  moq?: number | null;
  leadTimeDays?: number | null;
  imageKeys?: string[];
  attributes?: Record<string, any>;
  isActive?: boolean;
}

/** Listing images must be files uploaded for this business (sanity bound of 10). */
function checkImageKeys(businessId: string, keys: unknown): string[] {
  const prefix = `public/listings/${businessId}/`;
  if (!Array.isArray(keys) || keys.length > 10) {
    throw new ListingError("A listing can have at most 10 images");
  }
  for (const k of keys) {
    if (typeof k !== "string" || !k.startsWith(prefix) || k.includes("..")) {
      throw new ListingError("Invalid listing image reference");
    }
  }
  return keys as string[];
}

export async function createListing(actingBusinessId: string, data: ListingInputData) {
  const category = await prisma.category.findUnique({
    where: { id: data.categoryId },
  });

  if (!category) {
    throw new ListingError("Category not found");
  }

  // Validate attributes against category schema (§6, A1)
  const validatedAttributes = validateListingAttributes(
    category.slug,
    category.attributeSchema as unknown as AttributeSchema,
    data.attributes || {},
    data.description
  );

  return prisma.$transaction(async (tx) => {
    const listing = await tx.listing.create({
      data: {
        businessId: actingBusinessId,
        categoryId: data.categoryId,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        unit: data.unit.trim(),
        priceMin: data.priceMin !== undefined && data.priceMin !== null ? new Decimal(data.priceMin) : null,
        priceMax: data.priceMax !== undefined && data.priceMax !== null ? new Decimal(data.priceMax) : null,
        moq: data.moq || null,
        leadTimeDays: data.leadTimeDays || null,
        imageKeys: checkImageKeys(actingBusinessId, data.imageKeys || []),
        attributes: validatedAttributes,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
      include: {
        category: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorBusinessId: actingBusinessId,
        action: "listing:create",
        entityType: "Listing",
        entityId: listing.id,
        after: {
          title: listing.title,
          categoryId: listing.categoryId,
          priceMin: listing.priceMin ? Number(listing.priceMin) : null,
          priceMax: listing.priceMax ? Number(listing.priceMax) : null,
        },
      },
    });

    return listing;
  });
}

export async function updateListing(
  actingBusinessId: string,
  listingId: string,
  data: Partial<ListingInputData>
) {
  const existing = await prisma.listing.findFirst({
    where: {
      id: listingId,
      businessId: actingBusinessId,
      deletedAt: null,
    },
    include: { category: true },
  });

  if (!existing) {
    throw new ListingNotFoundError("Listing not found or access denied");
  }

  const categoryId = data.categoryId || existing.categoryId;
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });

  if (!category) {
    throw new ListingError("Category not found");
  }

  let validatedAttributes = existing.attributes as Record<string, any>;
  if (data.attributes) {
    // Preserve any existing archived/removed fields in the attributes JSON (A5)
    const merged = { ...validatedAttributes, ...data.attributes };
    const validated = validateListingAttributes(
      category.slug,
      category.attributeSchema as unknown as AttributeSchema,
      merged,
      data.description !== undefined ? data.description : existing.description
    );
    // Re-attach any archived keys that were in the original record
    for (const [k, v] of Object.entries(validatedAttributes)) {
      if (!(k in validated) && !(category.attributeSchema as any).fields?.some((f: any) => f.key === k)) {
        validated[k] = v;
      }
    }
    validatedAttributes = validated;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.listing.update({
      where: { id: listingId },
      data: {
        categoryId,
        title: data.title !== undefined ? data.title.trim() : existing.title,
        description: data.description !== undefined ? data.description?.trim() || null : existing.description,
        unit: data.unit !== undefined ? data.unit.trim() : existing.unit,
        priceMin:
          data.priceMin !== undefined
            ? data.priceMin !== null
              ? new Decimal(data.priceMin)
              : null
            : existing.priceMin,
        priceMax:
          data.priceMax !== undefined
            ? data.priceMax !== null
              ? new Decimal(data.priceMax)
              : null
            : existing.priceMax,
        moq: data.moq !== undefined ? data.moq : existing.moq,
        leadTimeDays: data.leadTimeDays !== undefined ? data.leadTimeDays : existing.leadTimeDays,
        imageKeys:
          data.imageKeys !== undefined ? checkImageKeys(actingBusinessId, data.imageKeys) : existing.imageKeys,
        attributes: validatedAttributes,
        isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
      },
      include: {
        category: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorBusinessId: actingBusinessId,
        action: "listing:update",
        entityType: "Listing",
        entityId: listingId,
        before: { title: existing.title, priceMin: existing.priceMin, priceMax: existing.priceMax },
        after: { title: updated.title, priceMin: updated.priceMin, priceMax: updated.priceMax },
      },
    });

    return updated;
  });
}

export async function deleteListing(actingBusinessId: string, listingId: string) {
  const existing = await prisma.listing.findFirst({
    where: {
      id: listingId,
      businessId: actingBusinessId,
      deletedAt: null,
    },
  });

  if (!existing) {
    throw new ListingNotFoundError("Listing not found or access denied");
  }

  return prisma.$transaction(async (tx) => {
    const deleted = await tx.listing.update({
      where: { id: listingId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await tx.auditLog.create({
      data: {
        actorBusinessId: actingBusinessId,
        action: "listing:delete",
        entityType: "Listing",
        entityId: listingId,
      },
    });

    return deleted;
  });
}

export async function getListingsForBusiness(businessId: string, includeInactive: boolean = false) {
  return prisma.listing.findMany({
    where: {
      businessId,
      deletedAt: null,
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: {
      category: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getListingByIdForBusiness(businessId: string, listingId: string) {
  return prisma.listing.findFirst({
    where: {
      id: listingId,
      businessId,
      deletedAt: null,
    },
    include: {
      category: true,
    },
  });
}

/**
 * Public listing retrieval (§7, D2, D3).
 * If listing is inactive/deleted or business is suspended/deleted, returns null (404).
 */
const PUBLIC_LISTING_LEVELS: VerificationStatus[] = [VerificationStatus.BASIC, VerificationStatus.VERIFIED];

export async function getPublicListingById(listingId: string) {
  const listing = await prisma.listing.findFirst({
    where: {
      id: listingId,
      deletedAt: null,
      isActive: true,
      business: {
        isSuspended: false,
        deletedAt: null,
        isSupplier: true,
        verificationStatus: { in: PUBLIC_LISTING_LEVELS },
      },
    },
    include: {
      category: true,
      business: {
        select: {
          id: true,
          name: true,
          slug: true,
          businessType: true,
          area: true,
          city: true,
          addressLine: true,
          verificationStatus: true,
          verifiedAt: true,
          isSuspended: true,
          logoKey: true,
          // phonePublic & whatsapp strictly omitted (§7, D1, D2)
        },
      },
    },
  });

  return listing;
}

/**
 * Public business profile retrieval (§7, D1, D3).
 * Never exposes phone numbers.
 * Returns null if suspended or deleted (D3).
 */
export async function getPublicBusinessBySlug(slug: string) {
  const business = await prisma.business.findFirst({
    where: {
      slug,
      deletedAt: null,
      isSuspended: false,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      businessType: true,
      area: true,
      city: true,
      addressLine: true,
      verificationStatus: true,
      verifiedAt: true,
      isBuyer: true,
      isSupplier: true,
      logoKey: true,
      createdAt: true,
      // phonePublic & whatsapp strictly excluded (§7, D1)
      listings: {
        where: {
          isActive: true,
          deletedAt: null,
        },
        include: {
          category: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  // Listings are public only while the supplier is BASIC/VERIFIED (§8.3)
  if (business && !(business.isSupplier && PUBLIC_LISTING_LEVELS.includes(business.verificationStatus))) {
    return { ...business, listings: [] };
  }
  return business;
}

export async function getAllCategories() {
  return listActiveCategories();
}
