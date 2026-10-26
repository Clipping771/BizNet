import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { PlatformRole, MemberRole, VerificationStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { sessionOptions } from "../../lib/session";
import { createBusiness } from "../../lib/repo/business";
import {
  submitVerificationRequest,
  reviewVerificationRequest,
  setBusinessVerificationStatus,
} from "../../lib/repo/verification";
import { getPublicListingById, getPublicBusinessBySlug, createListing } from "../../lib/repo/listing";
import { getFile } from "../../lib/storage";
import { POST as createTicket } from "../../app/api/files/upload/route";
import { PUT as uploadBytes } from "../../app/api/files/upload/[...key]/route";
import { GET as listAdminVerifications } from "../../app/api/admin/verifications/route";
import { POST as createListingRoute } from "../../app/api/business/listings/route";

const BASE = "http://localhost:3000";
const randomPhone = () => `+88019${Math.floor(10000000 + Math.random() * 90000000)}`;

async function cookieFor(data: Record<string, unknown>) {
  return `biznet_session=${await sealData({ ...data, isLoggedIn: true }, sessionOptions)}`;
}

async function makeUser(role: PlatformRole = PlatformRole.USER) {
  return prisma.user.create({ data: { phone: randomPhone(), name: "Fix Test User", role, phoneVerified: true } });
}

async function makeSupplier(ownerId: string, status: VerificationStatus) {
  const biz = await createBusiness(ownerId, {
    name: `Fix Test Supplier ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`,
    businessType: "Packaging Supplier",
    isBuyer: false,
    isSupplier: true,
    area: "Mirpur",
    city: "Dhaka",
    addressLine: "Road 1",
  } as any);
  return prisma.business.update({ where: { id: biz.id }, data: { verificationStatus: status } });
}

async function issueTicket(cookie: string, body: Record<string, unknown>) {
  const res = await createTicket(
    new NextRequest(`${BASE}/api/files/upload`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, json: await res.json() };
}

async function put(uploadUrl: string, opts: { cookie?: string; contentType: string; body: Buffer }) {
  const url = new URL(uploadUrl);
  const key = url.pathname.replace("/api/files/upload/", "").split("/");
  const headers: Record<string, string> = { "content-type": opts.contentType };
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await uploadBytes(new NextRequest(url, { method: "PUT", headers, body: new Uint8Array(opts.body) }), {
    params: Promise.resolve({ key }),
  });
  return res.status;
}

describe("Phase 2 fixes: signed uploads", () => {
  let owner: any, staff: any, other: any, biz: any;
  let ownerCookie: string, staffCookie: string, otherCookie: string;

  beforeAll(async () => {
    owner = await makeUser();
    staff = await makeUser();
    other = await makeUser();
    biz = await makeSupplier(owner.id, VerificationStatus.UNVERIFIED);
    await prisma.membership.create({ data: { userId: staff.id, businessId: biz.id, role: MemberRole.STAFF } });
    ownerCookie = await cookieFor({ userId: owner.id, activeBusinessId: biz.id });
    staffCookie = await cookieFor({ userId: staff.id, activeBusinessId: biz.id, businessRole: "OWNER" });
    otherCookie = await cookieFor({ userId: other.id });
  });

  const pdf = { filename: "license.pdf", contentType: "application/pdf", sizeBytes: 100, purpose: "verification_document" };

  it("ticket: 401 without login, 403 for STAFF even if the cookie claims OWNER", async () => {
    expect((await issueTicket("", pdf)).status).toBe(401);
    expect((await issueTicket(staffCookie, pdf)).status).toBe(403);
  });

  it("ticket keys are scoped to the active business", async () => {
    const { status, json } = await issueTicket(ownerCookie, pdf);
    expect(status).toBe(200);
    expect(json.key.startsWith(`private/verification/${biz.id}/`)).toBe(true);
  });

  it("PUT: anonymous 401, other user 403, tampered 403, wrong type 415, valid 200, overwrite 409", async () => {
    const { json } = await issueTicket(ownerCookie, pdf);
    const body = Buffer.from("%PDF-1.4 test");

    expect(await put(json.uploadUrl, { contentType: "application/pdf", body })).toBe(401);
    expect(await put(json.uploadUrl, { cookie: otherCookie, contentType: "application/pdf", body })).toBe(403);
    expect(await put(json.uploadUrl.replace(/sig=([0-9a-f])/, (_m: string, c: string) => `sig=${c === "0" ? "1" : "0"}`), { cookie: ownerCookie, contentType: "application/pdf", body })).toBe(403);
    expect(await put(json.uploadUrl, { cookie: ownerCookie, contentType: "text/html", body })).toBe(415);
    expect(await put(json.uploadUrl, { cookie: ownerCookie, contentType: "application/pdf", body })).toBe(200);
    expect((await getFile(json.key, true))?.buffer.toString()).toBe("%PDF-1.4 test");
    expect(await put(json.uploadUrl, { cookie: ownerCookie, contentType: "application/pdf", body })).toBe(409);
  });

  it("PUT: body larger than the ticket limit is rejected with 413", async () => {
    const { json } = await issueTicket(ownerCookie, {
      filename: "a.png",
      contentType: "image/png",
      sizeBytes: 1000,
      purpose: "listing_image",
    });
    const tooBig = Buffer.alloc(json.maxBytes + 1, 1);
    expect(await put(json.uploadUrl, { cookie: ownerCookie, contentType: "image/png", body: tooBig })).toBe(413);
  });

  it("PUT: changing the key in the URL invalidates the signature", async () => {
    const { json } = await issueTicket(ownerCookie, pdf);
    const forged = json.uploadUrl.replace(`/${biz.id}/`, "/someone-else/");
    expect(await put(forged, { cookie: ownerCookie, contentType: "application/pdf", body: Buffer.from("x") })).toBe(403);
  });
});

describe("Phase 2 fixes: verification lifecycle", () => {
  let admin: any, owner: any;

  beforeAll(async () => {
    admin = await makeUser(PlatformRole.ADMIN);
    owner = await makeUser();
  });

  const docKey = (bizId: string) => `private/verification/${bizId}/doc.pdf`;

  it("BASIC business asking for VERIFIED keeps BASIC; a rejection keeps BASIC", async () => {
    const biz = await makeSupplier(owner.id, VerificationStatus.BASIC);
    const vr = await submitVerificationRequest({ businessId: biz.id, userId: owner.id, documentKeys: [docKey(biz.id)] });
    expect((await prisma.business.findUnique({ where: { id: biz.id } }))?.verificationStatus).toBe("BASIC");

    await reviewVerificationRequest({ adminUserId: admin.id, requestId: vr.id, targetStatus: "REJECTED", minutesSpent: 5 });
    expect((await prisma.business.findUnique({ where: { id: biz.id } }))?.verificationStatus).toBe("BASIC");

    const vr2 = await submitVerificationRequest({ businessId: biz.id, userId: owner.id, documentKeys: [docKey(biz.id)] });
    await reviewVerificationRequest({ adminUserId: admin.id, requestId: vr2.id, targetStatus: "VERIFIED", minutesSpent: 5 });
    expect((await prisma.business.findUnique({ where: { id: biz.id } }))?.verificationStatus).toBe("VERIFIED");
  });

  it("PENDING request can be approved straight to VERIFIED", async () => {
    const biz = await makeSupplier(owner.id, VerificationStatus.UNVERIFIED);
    const vr = await submitVerificationRequest({ businessId: biz.id, userId: owner.id, documentKeys: [] });
    await reviewVerificationRequest({ adminUserId: admin.id, requestId: vr.id, targetStatus: "VERIFIED", minutesSpent: 3 });
    const after = await prisma.business.findUnique({ where: { id: biz.id } });
    expect(after?.verificationStatus).toBe("VERIFIED");
    expect(after?.verifiedAt).not.toBeNull();
  });

  it("two concurrent reviews: exactly one wins; a reviewed request cannot be reviewed again", async () => {
    const biz = await makeSupplier(owner.id, VerificationStatus.UNVERIFIED);
    const vr = await submitVerificationRequest({ businessId: biz.id, userId: owner.id, documentKeys: [] });
    const results = await Promise.allSettled([
      reviewVerificationRequest({ adminUserId: admin.id, requestId: vr.id, targetStatus: "BASIC", minutesSpent: 4 }),
      reviewVerificationRequest({ adminUserId: admin.id, requestId: vr.id, targetStatus: "REJECTED", minutesSpent: 4 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.opsTimeLog.count({ where: { refId: vr.id } })).toBe(1);

    await expect(
      reviewVerificationRequest({ adminUserId: admin.id, requestId: vr.id, targetStatus: "VERIFIED", minutesSpent: 1 })
    ).rejects.toThrow("already reviewed");
  });

  it("a second request while one is pending is refused", async () => {
    const biz = await makeSupplier(owner.id, VerificationStatus.UNVERIFIED);
    await submitVerificationRequest({ businessId: biz.id, userId: owner.id, documentKeys: [] });
    await expect(
      submitVerificationRequest({ businessId: biz.id, userId: owner.id, documentKeys: [] })
    ).rejects.toThrow("already pending");
  });

  it("suspend then reinstate clears isSuspended", async () => {
    const biz = await makeSupplier(owner.id, VerificationStatus.BASIC);
    await setBusinessVerificationStatus({ adminUserId: admin.id, businessId: biz.id, targetStatus: "SUSPENDED", minutesSpent: 2 });
    expect((await prisma.business.findUnique({ where: { id: biz.id } }))?.isSuspended).toBe(true);
    await setBusinessVerificationStatus({ adminUserId: admin.id, businessId: biz.id, targetStatus: "BASIC", minutesSpent: 2 });
    const after = await prisma.business.findUnique({ where: { id: biz.id } });
    expect(after?.isSuspended).toBe(false);
    expect(after?.verificationStatus).toBe("BASIC");
  });

  it("documents uploaded for another business are refused", async () => {
    const biz = await makeSupplier(owner.id, VerificationStatus.UNVERIFIED);
    await expect(
      submitVerificationRequest({
        businessId: biz.id,
        userId: owner.id,
        documentKeys: ["private/verification/other-business/doc.pdf"],
      })
    ).rejects.toThrow("Invalid verification document reference");
  });
});

describe("Phase 2 fixes: roles come from the database", () => {
  it("a cookie claiming ADMIN does not open admin routes for a DB USER", async () => {
    const user = await makeUser(PlatformRole.USER);
    const res = await listAdminVerifications(
      new NextRequest(`${BASE}/api/admin/verifications`, { headers: { cookie: await cookieFor({ userId: user.id, role: "ADMIN" }) } })
    );
    expect(res.status).toBe(403);
  });

  it("a demoted admin loses access immediately", async () => {
    const user = await makeUser(PlatformRole.ADMIN);
    const cookie = await cookieFor({ userId: user.id, role: "ADMIN" });
    const req = () => new NextRequest(`${BASE}/api/admin/verifications`, { headers: { cookie } });
    expect((await listAdminVerifications(req())).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { role: PlatformRole.USER } });
    expect((await listAdminVerifications(req())).status).toBe(403);
  });

  it("STAFF cannot create listings even if the cookie says MANAGER", async () => {
    const owner = await makeUser();
    const staff = await makeUser();
    const biz = await makeSupplier(owner.id, VerificationStatus.BASIC);
    await prisma.membership.create({ data: { userId: staff.id, businessId: biz.id, role: MemberRole.STAFF } });
    const other = await prisma.category.findFirstOrThrow({ where: { slug: "other" } });
    const res = await createListingRoute(
      new NextRequest(`${BASE}/api/business/listings`, {
        method: "POST",
        headers: {
          cookie: await cookieFor({ userId: staff.id, activeBusinessId: biz.id, businessRole: "MANAGER" }),
          "content-type": "application/json",
        },
        body: JSON.stringify({ categoryId: other.id, title: "Staff listing", description: "x", unit: "pcs" }),
      })
    );
    expect(res.status).toBe(403);
  });
});

describe("Phase 2 fixes: public listings only for BASIC/VERIFIED suppliers", () => {
  it("hides listings once the supplier is no longer verified", async () => {
    const owner = await makeUser();
    const biz = await makeSupplier(owner.id, VerificationStatus.BASIC);
    const other = await prisma.category.findFirstOrThrow({ where: { slug: "other" } });
    const listing = await createListing(biz.id, {
      categoryId: other.id,
      title: "Public test listing",
      description: "Plain paper bags",
      unit: "pcs",
    } as any);

    expect(await getPublicListingById(listing.id)).not.toBeNull();
    expect((await getPublicBusinessBySlug(biz.slug))?.listings).toHaveLength(1);

    await prisma.business.update({ where: { id: biz.id }, data: { verificationStatus: VerificationStatus.REJECTED } });
    expect(await getPublicListingById(listing.id)).toBeNull();
    expect((await getPublicBusinessBySlug(biz.slug))?.listings).toHaveLength(0);
  });

  it("listing images must belong to the business", async () => {
    const owner = await makeUser();
    const biz = await makeSupplier(owner.id, VerificationStatus.BASIC);
    const other = await prisma.category.findFirstOrThrow({ where: { slug: "other" } });
    await expect(
      createListing(biz.id, {
        categoryId: other.id,
        title: "Bad image listing",
        description: "x",
        unit: "pcs",
        imageKeys: ["private/verification/x/doc.pdf"],
      } as any)
    ).rejects.toThrow("Invalid listing image reference");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
