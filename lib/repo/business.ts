import { prisma } from "../prisma";
import { Business, MemberRole, VerificationStatus } from "@prisma/client";

export interface CreateBusinessInput {
  name: string;
  businessType: string;
  isBuyer?: boolean;
  isSupplier?: boolean;
  area: string;
  city: string;
  addressLine?: string;
  whatsapp?: string;
  phonePublic?: string;
  deliveryAreas?: string[];
  categoryIds?: string[];
}

export function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `biz-${Date.now().toString(36)}`;
}

export async function createBusiness(
  userId: string,
  input: CreateBusinessInput
): Promise<Business> {
  const rawSlug = generateSlug(input.name);
  let slug = rawSlug;
  let counter = 1;

  while (await prisma.business.findUnique({ where: { slug } })) {
    slug = `${rawSlug}-${counter}`;
    counter++;
  }

  return prisma.$transaction(async (tx) => {
    // 1. Create Business
    const business = await tx.business.create({
      data: {
        slug,
        name: input.name,
        businessType: input.businessType,
        isBuyer: input.isBuyer ?? true,
        isSupplier: input.isSupplier ?? false,
        area: input.area,
        city: input.city,
        addressLine: input.addressLine || `${input.area}, ${input.city || "Global"}`,
        whatsapp: input.whatsapp ?? null,
        phonePublic: input.phonePublic ?? null,
        deliveryAreas: input.deliveryAreas || [input.area],
        verificationStatus: VerificationStatus.UNVERIFIED,
      },
    });

    // 2. Creator becomes OWNER (exactly one OWNER invariant)
    await tx.membership.create({
      data: {
        userId,
        businessId: business.id,
        role: MemberRole.OWNER,
      },
    });

    // 3. Set active business for the user
    await tx.user.update({
      where: { id: userId },
      data: { activeBusinessId: business.id },
    });

    // 4. Attach categories if supplier
    if (input.isSupplier && input.categoryIds && input.categoryIds.length > 0) {
      await tx.supplierCategory.createMany({
        data: input.categoryIds.map((categoryId) => ({
          businessId: business.id,
          categoryId,
        })),
        skipDuplicates: true,
      });
    }

    return business;
  });
}

export async function findBusinessById(id: string): Promise<Business | null> {
  return prisma.business.findFirst({
    where: { id, deletedAt: null },
    include: {
      members: {
        include: { user: true },
      },
      supplierCategories: {
        include: { category: true },
      },
    },
  });
}

export const getBusinessById = findBusinessById;

export async function findBusinessBySlug(slug: string): Promise<Business | null> {
  return prisma.business.findFirst({
    where: { slug, deletedAt: null },
    include: {
      supplierCategories: {
        include: { category: true },
      },
    },
  });
}

export async function listUserBusinesses(userId: string): Promise<Business[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: {
      business: {
        include: {
          supplierCategories: {
            include: { category: true },
          },
        },
      },
    },
  });
  return memberships.map((m) => m.business);
}
