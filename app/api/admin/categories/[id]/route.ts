import { NextResponse } from "next/server";
import { adminRouteWithParams } from "@/lib/admin/route";
import { saveCategory } from "@/lib/repo/admin";

/** PUT /api/admin/categories/[id] { attributeSchema, defaultUnits, sortOrder, isActive } — audited. */
export const PUT = adminRouteWithParams<{ id: string }>("Update category error", async (req, ctx, { id }) => {
  const body = await req.json();
  return NextResponse.json(await saveCategory({ adminUserId: ctx.userId, ...body, id }));
});
