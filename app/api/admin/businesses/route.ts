import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin/route";
import { listBusinessesForAdmin } from "@/lib/repo/admin";

export const GET = adminRoute("List businesses error", async (req) => {
  return NextResponse.json({ businesses: await listBusinessesForAdmin(req.nextUrl.searchParams.get("q")) });
});
