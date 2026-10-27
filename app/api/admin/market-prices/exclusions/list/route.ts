import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin/route";
import { listPriceExclusions } from "@/lib/repo/pricing";

export const GET = adminRoute("List exclusions error", async () => {
  return NextResponse.json({ exclusions: await listPriceExclusions() });
});
