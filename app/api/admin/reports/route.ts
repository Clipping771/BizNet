import { NextResponse } from "next/server";
import { ReportStatus } from "@prisma/client";
import { adminRoute } from "@/lib/admin/route";
import { listReports } from "@/lib/repo/admin";
import { listHeldQuestions } from "@/lib/repo/discussion";

/** GET /api/admin/reports?status=OPEN|ALL|… — reports plus questions held by the selling filter. */
export const GET = adminRoute("List reports error", async (req) => {
  const raw = req.nextUrl.searchParams.get("status") ?? "OPEN";
  const status = raw === "ALL" ? "ALL" : Object.values(ReportStatus).includes(raw as ReportStatus) ? (raw as ReportStatus) : ReportStatus.OPEN;
  const [reports, heldQuestions] = await Promise.all([listReports(status), listHeldQuestions()]);
  return NextResponse.json({ reports, heldQuestions });
});
