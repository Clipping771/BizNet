/**
 * lib/repo/admin.ts
 *
 * Admin back office (§7, §19): moderation reports, businesses and bans, requests overview,
 * category schemas, typed settings, CSV export and the nightly AI eval report. Every
 * mutation writes an AuditLog entry.
 */

import { PlatformRole, Prisma, ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { defaultSettings, getSetting, updateSetting, type PlatformSettings, type EvalReport } from "@/lib/settings";

export class AdminRepoError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "AdminRepoError";
  }
}

// ---- Reports / moderation ------------------------------------------------------------------

export async function listReports(status: ReportStatus | "ALL" = ReportStatus.OPEN) {
  return prisma.report.findMany({
    where: status === "ALL" ? {} : { status },
    include: { reporter: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function resolveReport(input: { adminUserId: string; reportId: string; status: ReportStatus; note?: string | null }) {
  if (input.status === ReportStatus.OPEN) throw new AdminRepoError("Choose a resolution");
  const report = await prisma.report.findUnique({ where: { id: input.reportId } });
  if (!report) throw new AdminRepoError("Report not found", 404);
  const updated = await prisma.report.update({
    where: { id: report.id },
    data: { status: input.status, resolvedByUserId: input.adminUserId, resolutionNote: input.note?.trim() || null },
  });
  await logAudit({
    actorUserId: input.adminUserId,
    action: "REPORT_RESOLVED",
    entityType: "REPORT",
    entityId: report.id,
    before: { status: report.status },
    after: { status: updated.status, note: updated.resolutionNote },
  });
  return updated;
}

// ---- Businesses / users ---------------------------------------------------------------------

export async function listBusinessesForAdmin(q?: string | null) {
  return prisma.business.findMany({
    where: {
      deletedAt: null,
      ...(q?.trim() ? { OR: [{ name: { contains: q.trim(), mode: "insensitive" } }, { slug: { contains: q.trim() } }] } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      area: true,
      isBuyer: true,
      isSupplier: true,
      verificationStatus: true,
      isSuspended: true,
      createdAt: true,
      _count: { select: { listings: true, requestsAsBuyer: true, quotes: true } },
      members: { select: { role: true, user: { select: { id: true, name: true, isBanned: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function setUserBanned(input: { adminUserId: string; userId: string; banned: boolean; note?: string | null }) {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, isBanned: true, role: true } });
  if (!user) throw new AdminRepoError("User not found", 404);
  if (user.role === PlatformRole.ADMIN) throw new AdminRepoError("Admins cannot be banned here");
  const updated = await prisma.user.update({ where: { id: user.id }, data: { isBanned: input.banned }, select: { id: true, isBanned: true } });
  await logAudit({
    actorUserId: input.adminUserId,
    action: input.banned ? "USER_BANNED" : "USER_UNBANNED",
    entityType: "USER",
    entityId: user.id,
    before: { isBanned: user.isBanned },
    after: { isBanned: updated.isBanned, note: input.note ?? null },
  });
  return updated;
}

// ---- Requests overview ----------------------------------------------------------------------

export async function listRequestsForAdmin(status?: string | null) {
  return prisma.request.findMany({
    where: status ? { status: status as any } : {},
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      outcome: true,
      deliveryArea: true,
      createdAt: true,
      createdViaConcierge: true,
      buyerBusiness: { select: { name: true } },
      category: { select: { slug: true } },
      _count: { select: { invites: true, quotes: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

// ---- Categories ------------------------------------------------------------------------------

const FIELD_TYPES = ["text", "number", "select", "multiselect", "boolean"];

/** Validates an attribute schema (§6): unique snake_case keys, known types, options for selects. */
export function validateAttributeSchema(schema: unknown): { fields: Array<Record<string, unknown>> } {
  const fields = (schema as any)?.fields;
  if (!Array.isArray(fields)) throw new AdminRepoError("Schema must be { fields: [...] }");
  const keys = new Set<string>();
  for (const f of fields) {
    if (!f || typeof f.key !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(f.key)) throw new AdminRepoError(`Invalid field key: ${f?.key}`);
    if (keys.has(f.key)) throw new AdminRepoError(`Duplicate field key: ${f.key}`);
    keys.add(f.key);
    if (!FIELD_TYPES.includes(f.type)) throw new AdminRepoError(`Invalid type for ${f.key}`);
    if ((f.type === "select" || f.type === "multiselect") && (!Array.isArray(f.options) || f.options.length === 0 || f.options.some((o: unknown) => typeof o !== "string"))) {
      throw new AdminRepoError(`${f.key} needs a list of options`);
    }
    for (const flag of ["required", "filterable", "comparable"]) {
      if (f[flag] !== undefined && typeof f[flag] !== "boolean") throw new AdminRepoError(`${f.key}.${flag} must be true or false`);
    }
    if (f.min !== undefined && typeof f.min !== "number") throw new AdminRepoError(`${f.key}.min must be a number`);
    if (f.max !== undefined && typeof f.max !== "number") throw new AdminRepoError(`${f.key}.max must be a number`);
  }
  return { fields };
}

export async function listCategoriesForAdmin() {
  return prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { listings: true, requests: true } } },
  });
}

export async function saveCategory(input: {
  adminUserId: string;
  id?: string | null;
  slug?: string;
  attributeSchema: unknown;
  defaultUnits: unknown;
  sortOrder: unknown;
  isActive: unknown;
}) {
  const attributeSchema = validateAttributeSchema(input.attributeSchema);
  const defaultUnits = Array.isArray(input.defaultUnits) ? input.defaultUnits.map(String).filter(Boolean) : [];
  if (defaultUnits.length === 0) throw new AdminRepoError("At least one unit is required");
  const sortOrder = Number(input.sortOrder) || 0;
  const isActive = input.isActive !== false;
  const data = { attributeSchema: attributeSchema as Prisma.InputJsonValue, defaultUnits, sortOrder, isActive };

  if (input.id) {
    const before = await prisma.category.findUnique({ where: { id: input.id } });
    if (!before) throw new AdminRepoError("Category not found", 404);
    const updated = await prisma.category.update({ where: { id: input.id }, data });
    await logAudit({ actorUserId: input.adminUserId, action: "CATEGORY_UPDATED", entityType: "CATEGORY", entityId: updated.id, before: { ...before }, after: { ...updated } });
    return updated;
  }
  const slug = String(input.slug ?? "").trim();
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(slug)) throw new AdminRepoError("Slug must be snake_case");
  if (await prisma.category.findUnique({ where: { slug } })) throw new AdminRepoError("Slug already exists", 409);
  const created = await prisma.category.create({ data: { slug, ...data } });
  await logAudit({ actorUserId: input.adminUserId, action: "CATEGORY_CREATED", entityType: "CATEGORY", entityId: created.id, after: { ...created } });
  return created;
}

// ---- Settings --------------------------------------------------------------------------------

export async function listSettings() {
  const keys = Object.keys(defaultSettings) as Array<keyof PlatformSettings>;
  const values: Record<string, unknown> = {};
  for (const key of keys) values[key] = await getSetting(key);
  return values;
}

function sameShape(value: unknown, reference: unknown): boolean {
  if (reference === null) return true; // nullable settings accept any JSON (validated elsewhere)
  if (Array.isArray(reference)) {
    if (!Array.isArray(value)) return false;
    return reference.length === 0 || value.every((v) => sameShape(v, reference[0]));
  }
  if (typeof reference === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return Object.keys(reference as object).every((k) => sameShape((value as any)[k], (reference as any)[k]));
  }
  return typeof value === typeof reference;
}

/** Typed settings: the new value must have the same shape as the default; audited (§9). */
export async function saveSetting(input: { adminUserId: string; key: string; value: unknown }) {
  if (!(input.key in defaultSettings)) throw new AdminRepoError("Unknown setting", 404);
  const key = input.key as keyof PlatformSettings;
  if (key === "latestEvalReport") throw new AdminRepoError("This value is written by the eval workflow");
  if (!sameShape(input.value, defaultSettings[key])) throw new AdminRepoError(`Invalid value for ${key}`);
  if (typeof input.value === "number" && (!Number.isFinite(input.value) || input.value < 0)) throw new AdminRepoError(`${key} must be a positive number`);
  const before = await getSetting(key);
  await updateSetting(key, input.value as never);
  await logAudit({ actorUserId: input.adminUserId, action: "SETTING_CHANGED", entityType: "SETTING", entityId: key, before: { value: before as any }, after: { value: input.value as any } });
  return { key, value: input.value };
}

// ---- AI eval report (nightly CI, §12) ------------------------------------------------------------

export async function storeEvalReport(report: Omit<EvalReport, "receivedAt">) {
  const value: EvalReport = { ...report, receivedAt: new Date().toISOString() };
  await updateSetting("latestEvalReport", value);
  const minCat = await getSetting("evalMinCategoryAccuracy");
  const minField = await getSetting("evalMinFieldAccuracy");
  const belowThreshold = report.categoryAccuracy < minCat || report.fieldAccuracy < minField;
  if (belowThreshold) {
    // Alert every admin in-app
    const admins = await prisma.user.findMany({ where: { role: PlatformRole.ADMIN, deletedAt: null }, select: { id: true } });
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: "AI_EVAL_BELOW_THRESHOLD",
        params: { categoryAccuracy: report.categoryAccuracy, fieldAccuracy: report.fieldAccuracy },
        link: "/admin",
      })),
    });
  }
  await logAudit({ action: "AI_EVAL_REPORT", entityType: "AI_EVAL", entityId: value.receivedAt, after: { ...value, belowThreshold } });
  return { ...value, belowThreshold };
}

// ---- CSV export -----------------------------------------------------------------------------------

export const EXPORT_ENTITIES = ["requests", "quotes", "orders", "feedback", "businesses", "opsTime"] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];

function csv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "\n";
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
    // Neutralise spreadsheet formulas and quote every cell
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\n") + "\n";
}

export async function exportCsv(entity: ExportEntity, from: Date, to: Date): Promise<string> {
  const createdAt = { gte: from, lt: to };
  switch (entity) {
    case "requests":
      return csv(
        (await prisma.request.findMany({ where: { createdAt }, include: { category: { select: { slug: true } }, _count: { select: { invites: true, quotes: true } } }, orderBy: { createdAt: "asc" } })).map((r) => ({
          code: r.code,
          createdAt: r.createdAt,
          buyerBusinessId: r.buyerBusinessId,
          category: r.category.slug,
          title: r.title,
          quantity: r.quantity.toString(),
          unit: r.unit,
          deliveryArea: r.deliveryArea,
          status: r.status,
          outcome: r.outcome,
          aiAssisted: !!r.aiInteractionId,
          concierge: r.createdViaConcierge,
          invites: r._count.invites,
          quotes: r._count.quotes,
        }))
      );
    case "quotes":
      return csv(
        (await prisma.quote.findMany({ where: { createdAt }, include: { request: { select: { code: true } } }, orderBy: { createdAt: "asc" } })).map((q) => ({
          id: q.id,
          request: q.request.code,
          supplierBusinessId: q.supplierBusinessId,
          createdAt: q.createdAt,
          unitPrice: q.unitPrice.toString(),
          quantity: q.quantity.toString(),
          deliveryCharge: q.deliveryCharge.toString(),
          totalPrice: q.totalPrice.toString(),
          deliveryDays: q.deliveryDays,
          paymentTerm: q.paymentTerm,
          status: q.status,
          source: q.source,
          version: q.version,
        }))
      );
    case "orders":
      return csv(
        (await prisma.order.findMany({ where: { createdAt }, orderBy: { createdAt: "asc" } })).map((o) => ({
          code: o.code,
          createdAt: o.createdAt,
          buyerBusinessId: o.buyerBusinessId,
          supplierBusinessId: o.supplierBusinessId,
          status: o.status,
          total: (o.snapshot as any)?.total ?? "",
          dispatchedAt: o.dispatchedAt,
          deliveredAt: o.deliveredAt,
          completedAt: o.completedAt,
          cancelledAt: o.cancelledAt,
          cancelledBySide: o.cancelledBySide,
          disputeResolution: o.disputeResolution,
        }))
      );
    case "feedback":
      return csv(
        (await prisma.reliabilityFeedback.findMany({ where: { createdAt }, include: { order: { select: { code: true, supplierBusinessId: true } } }, orderBy: { createdAt: "asc" } })).map((f) => ({
          order: f.order.code,
          supplierBusinessId: f.order.supplierBusinessId,
          createdAt: f.createdAt,
          onTime: f.onTime,
          quantityCorrect: f.quantityCorrect,
          matchedSpec: f.matchedSpec,
          hadIssue: f.hadIssue,
          issueResolved: f.issueResolved,
        }))
      );
    case "businesses":
      return csv(
        (await prisma.business.findMany({ where: { createdAt }, orderBy: { createdAt: "asc" } })).map((b) => ({
          id: b.id,
          name: b.name,
          area: b.area,
          isBuyer: b.isBuyer,
          isSupplier: b.isSupplier,
          verificationStatus: b.verificationStatus,
          isSuspended: b.isSuspended,
          createdAt: b.createdAt,
        }))
      );
    case "opsTime":
      return csv(
        (await prisma.opsTimeLog.findMany({ where: { createdAt }, orderBy: { createdAt: "asc" } })).map((l) => ({
          createdAt: l.createdAt,
          userId: l.userId,
          activity: l.activity,
          minutes: l.minutes,
          refType: l.refType,
          refId: l.refId,
        }))
      );
  }
}
