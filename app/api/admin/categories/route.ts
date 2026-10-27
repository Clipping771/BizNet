import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin/route";
import { listCategoriesForAdmin, saveCategory } from "@/lib/repo/admin";

export const GET = adminRoute("List categories error", async () => {
  return NextResponse.json({ categories: await listCategoriesForAdmin() });
});

/** POST /api/admin/categories { slug, attributeSchema, defaultUnits, sortOrder, isActive } — audited. */
export const POST = adminRoute("Create category error", async (req, ctx) => {
  const body = await req.json();
  return NextResponse.json(await saveCategory({ adminUserId: ctx.userId, ...body, id: null }), { status: 201 });
});
