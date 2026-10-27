import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin/route";
import { listPendingPayments } from "@/lib/repo/credits";

export const GET = adminRoute("List payments error", async () => {
  return NextResponse.json({ payments: await listPendingPayments() });
});
