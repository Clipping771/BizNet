import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin/route";
import { listRequestsForAdmin } from "@/lib/repo/admin";

export const GET = adminRoute("List requests error", async (req) => {
  return NextResponse.json({ requests: await listRequestsForAdmin(req.nextUrl.searchParams.get("status")) });
});
