import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, PlatformRole, MemberRole, VerificationStatus } from "@prisma/client";
import {
  validateVerificationTransition,
  submitVerificationRequest,
  reviewVerificationRequest,
  VerificationError,
} from "@/lib/repo/verification";
import {
  validateUploadParams,
  generateSignedDownloadToken,
  verifySignedDownloadToken,
  putFile,
  getFile,
  getPrivateFileSignedUrl,
} from "@/lib/storage";
import { assertCan, AuthorizationError } from "@/lib/authz";

const prisma = new PrismaClient();

describe("Phase 2 - B. Verification & Storage (§8.3, F3)", () => {
  let adminUser: any;
  let supplierUser: any;
  let otherUser: any;
  let testBusiness: any;
  let otherBusiness: any;

  beforeAll(async () => {
    // 1. Setup Admin User
    adminUser = await prisma.user.upsert({
      where: { phone: "+8801799990001" },
      update: { role: PlatformRole.ADMIN },
      create: {
        phone: "+8801799990001",
        name: "Test Admin Verifier",
        role: PlatformRole.ADMIN,
        phoneVerified: true,
      },
    });

    // 2. Setup Supplier User and Business
    supplierUser = await prisma.user.upsert({
      where: { phone: "+8801799990002" },
      update: {},
      create: {
        phone: "+8801799990002",
        name: "Test Supplier Owner",
        role: PlatformRole.USER,
        phoneVerified: true,
      },
    });

    testBusiness = await prisma.business.create({
      data: {
        slug: `test-verif-biz-${Date.now()}`,
        name: "সোনালী প্যাকেজিং",
        businessType: "Packaging Supplier",
        isSupplier: true,
        isBuyer: false,
        area: "Chawkbazar",
        city: "Dhaka",
        addressLine: "12 Chawkbazar, Dhaka",
        phonePublic: "+8801799990002",
        whatsapp: "+8801799990002",
        verificationStatus: VerificationStatus.UNVERIFIED,
      },
    });

    await prisma.membership.create({
      data: {
        userId: supplierUser.id,
        businessId: testBusiness.id,
        role: MemberRole.OWNER,
      },
    });

    // 3. Setup Other User & Other Business
    otherUser = await prisma.user.upsert({
      where: { phone: "+8801799990003" },
      update: {},
      create: {
        phone: "+8801799990003",
        name: "Other Business User",
        role: PlatformRole.USER,
        phoneVerified: true,
      },
    });

    otherBusiness = await prisma.business.create({
      data: {
        slug: `other-verif-biz-${Date.now()}`,
        name: "অন্যান্য এন্টারপ্রাইজ",
        businessType: "Buyer Restaurant",
        isSupplier: false,
        isBuyer: true,
        area: "Dhanmondi",
        city: "Dhaka",
        addressLine: "Road 27, Dhanmondi",
        verificationStatus: VerificationStatus.UNVERIFIED,
      },
    });

    await prisma.membership.create({
      data: {
        userId: otherUser.id,
        businessId: otherBusiness.id,
        role: MemberRole.OWNER,
      },
    });
  });

  afterAll(async () => {
    // Clean up created records without empty deleteMany
    await prisma.opsTimeLog.deleteMany({ where: { userId: adminUser.id } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorBusinessId: testBusiness.id },
          { actorBusinessId: otherBusiness.id },
        ],
      },
    });
    await prisma.verificationRequest.deleteMany({
      where: { businessId: testBusiness.id },
    });
    await prisma.membership.deleteMany({
      where: {
        OR: [{ businessId: testBusiness.id }, { businessId: otherBusiness.id }],
      },
    });
    await prisma.business.deleteMany({
      where: {
        id: { in: [testBusiness.id, otherBusiness.id] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [adminUser.id, supplierUser.id, otherUser.id] },
      },
    });
    await prisma.$disconnect();
  });

  describe("B4: Verification Status Transition State Machine Table Test", () => {
    const legalTransitions: [VerificationStatus, VerificationStatus][] = [
      [VerificationStatus.UNVERIFIED, VerificationStatus.PENDING],
      [VerificationStatus.PENDING, VerificationStatus.BASIC],
      [VerificationStatus.PENDING, VerificationStatus.REJECTED],
      [VerificationStatus.BASIC, VerificationStatus.VERIFIED],
      [VerificationStatus.BASIC, VerificationStatus.PENDING],
      [VerificationStatus.BASIC, VerificationStatus.SUSPENDED],
      [VerificationStatus.VERIFIED, VerificationStatus.SUSPENDED],
      [VerificationStatus.VERIFIED, VerificationStatus.PENDING],
      [VerificationStatus.REJECTED, VerificationStatus.PENDING],
      [VerificationStatus.SUSPENDED, VerificationStatus.BASIC],
      [VerificationStatus.SUSPENDED, VerificationStatus.VERIFIED],
      [VerificationStatus.SUSPENDED, VerificationStatus.UNVERIFIED],
    ];

    const illegalTransitions: [VerificationStatus, VerificationStatus][] = [
      [VerificationStatus.UNVERIFIED, VerificationStatus.BASIC], // cannot skip PENDING
      [VerificationStatus.UNVERIFIED, VerificationStatus.VERIFIED], // cannot jump to VERIFIED
      [VerificationStatus.UNVERIFIED, VerificationStatus.REJECTED],
      [VerificationStatus.PENDING, VerificationStatus.VERIFIED], // cannot skip BASIC
      [VerificationStatus.PENDING, VerificationStatus.UNVERIFIED],
      [VerificationStatus.VERIFIED, VerificationStatus.UNVERIFIED], // verified cannot demote to unverified
      [VerificationStatus.REJECTED, VerificationStatus.BASIC], // rejected must re-apply first
      [VerificationStatus.REJECTED, VerificationStatus.VERIFIED],
    ];

    for (const [from, to] of legalTransitions) {
      it(`allows legal transition: ${from} -> ${to}`, () => {
        expect(validateVerificationTransition(from, to)).toBe(true);
      });
    }

    for (const [from, to] of illegalTransitions) {
      it(`rejects illegal transition: ${from} -> ${to}`, () => {
        expect(validateVerificationTransition(from, to)).toBe(false);
      });
    }
  });

  describe("B2: File Type and Size Validation (§8.3)", () => {
    it("accepts valid verification document types and sizes", () => {
      const validJpg = validateUploadParams({
        contentType: "image/jpeg",
        sizeBytes: 2 * 1024 * 1024,
        purpose: "verification_document",
      });
      expect(validJpg.valid).toBe(true);

      const validPdf = validateUploadParams({
        contentType: "application/pdf",
        sizeBytes: 8 * 1024 * 1024,
        purpose: "verification_document",
      });
      expect(validPdf.valid).toBe(true);
    });

    it("rejects unauthorized file types for verification documents", () => {
      const invalidExe = validateUploadParams({
        contentType: "application/x-msdownload",
        sizeBytes: 1024,
        purpose: "verification_document",
      });
      expect(invalidExe.valid).toBe(false);

      const invalidTxt = validateUploadParams({
        contentType: "text/plain",
        sizeBytes: 1024,
        purpose: "verification_document",
      });
      expect(invalidTxt.valid).toBe(false);
    });

    it("rejects verification documents exceeding 10MB limit", () => {
      const oversized = validateUploadParams({
        contentType: "application/pdf",
        sizeBytes: 11 * 1024 * 1024, // 11MB
        purpose: "verification_document",
      });
      expect(oversized.valid).toBe(false);
      expect(oversized.error).toContain("10MB");
    });
  });

  describe("B1 & B3: Verification Submission, Review & Atomic Audit/Ops Logging", () => {
    let createdRequestId: string;
    const testDocKey = "private/verification/test-doc-key.pdf";

    it("B1: supplier submits verification and status transitions to PENDING", async () => {
      // Store dummy document in private storage
      await putFile(testDocKey, Buffer.from("PDF Mock Content"), "application/pdf", true);

      const vr = await submitVerificationRequest({
        businessId: testBusiness.id,
        userId: supplierUser.id,
        tradeLicenseNo: "TRAD-DHAKA-12345",
        documentKeys: [testDocKey],
        referenceName: "Rahim Bhai",
        referencePhone: "+8801711112222",
      });

      expect(vr.id).toBeDefined();
      expect(vr.status).toBe(VerificationStatus.PENDING);
      createdRequestId = vr.id;

      const updatedBiz = await prisma.business.findUnique({
        where: { id: testBusiness.id },
      });
      expect(updatedBiz?.verificationStatus).toBe(VerificationStatus.PENDING);
    });

    it("B3: rejects review when minutes spent is missing or <= 0", async () => {
      await expect(
        reviewVerificationRequest({
          adminUserId: adminUser.id,
          requestId: createdRequestId,
          targetStatus: VerificationStatus.BASIC,
          minutesSpent: 0, // Invalid!
        })
      ).rejects.toThrow("Minutes spent is strictly required and must be greater than 0");
    });

    it("B3: admin approves BASIC with minutesSpent, writing OpsTimeLog and AuditLog", async () => {
      const reviewed = await reviewVerificationRequest({
        adminUserId: adminUser.id,
        requestId: createdRequestId,
        targetStatus: VerificationStatus.BASIC,
        minutesSpent: 20,
        reviewNote: "Physical premises and trade reference called and verified.",
        checklist: { phone: true, reference: true, document: false },
      });

      expect(reviewed.status).toBe(VerificationStatus.BASIC);
      expect(reviewed.minutesSpent).toBe(20);

      const biz = await prisma.business.findUnique({
        where: { id: testBusiness.id },
      });
      expect(biz?.verificationStatus).toBe(VerificationStatus.BASIC);
      expect(biz?.verifiedAt).not.toBeNull();

      // Check OpsTimeLog entry
      const opsLog = await prisma.opsTimeLog.findFirst({
        where: {
          refId: createdRequestId,
          refType: "VerificationRequest",
        },
      });
      expect(opsLog).toBeDefined();
      expect(opsLog?.minutes).toBe(20);
      expect(opsLog?.userId).toBe(adminUser.id);
      expect(opsLog?.activity).toBe("verification_review");

      // Check AuditLog entry
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityId: createdRequestId,
          entityType: "VerificationRequest",
          action: "verification:review",
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.actorUserId).toBe(adminUser.id);
    });
  });

  describe("B6 & B7: Private File Access Control & 5-min Signed URLs", () => {
    const testPrivateDocKey = "private/verification/test-license-999.pdf";

    beforeAll(async () => {
      await putFile(testPrivateDocKey, Buffer.from("Secret License Details"), "application/pdf", true);
    });

    it("B7: admin gets signed URL for private verification document", async () => {
      const adminCtx = {
        userId: adminUser.id,
        role: PlatformRole.ADMIN,
      };

      // assertCan allows admin
      expect(() =>
        assertCan(adminCtx, "file:read_private", { isVerificationDocument: true })
      ).not.toThrow();

      const signedUrl = await getPrivateFileSignedUrl(testPrivateDocKey, 300);
      expect(signedUrl).toBeDefined();
      expect(signedUrl).toContain("expires=");
      expect(signedUrl).toContain("sig=");
    });

    it("B7: document owner business OWNER is denied access to private verification documents (spec: admin-only)", () => {
      const ownerCtx = {
        userId: supplierUser.id,
        role: PlatformRole.USER,
        activeBusinessId: testBusiness.id,
        businessRole: MemberRole.OWNER,
      };

      // Even the OWNER of the business that uploaded the doc gets 403 (admin-only)
      expect(() =>
        assertCan(ownerCtx, "file:read_private", { isVerificationDocument: true })
      ).toThrow("Verification documents are strictly admin-only");
    });

    it("B7: other business is denied access (403)", () => {
      const otherCtx = {
        userId: otherUser.id,
        role: PlatformRole.USER,
        activeBusinessId: otherBusiness.id,
        businessRole: MemberRole.OWNER,
      };

      expect(() =>
        assertCan(otherCtx, "file:read_private", { isVerificationDocument: true })
      ).toThrow("Verification documents are strictly admin-only");
    });

    it("B7: signed URL verification succeeds within 5 minutes", () => {
      const expiresAt = Date.now() + 300 * 1000;
      const sig = generateSignedDownloadToken(testPrivateDocKey, expiresAt);

      const isValid = verifySignedDownloadToken(testPrivateDocKey, expiresAt, sig);
      expect(isValid).toBe(true);
    });

    it("B7: signed URL fails when expired or tampered", () => {
      // 1. Expired timestamp in the past
      const expiredTimestamp = Date.now() - 5000;
      const expiredSig = generateSignedDownloadToken(testPrivateDocKey, expiredTimestamp);

      const isExpiredValid = verifySignedDownloadToken(
        testPrivateDocKey,
        expiredTimestamp,
        expiredSig
      );
      expect(isExpiredValid).toBe(false);

      // 2. Tampered signature
      const validTimestamp = Date.now() + 60000;
      const fakeSig = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      const isTamperedValid = verifySignedDownloadToken(
        testPrivateDocKey,
        validTimestamp,
        fakeSig
      );
      expect(isTamperedValid).toBe(false);
    });
  });
});
