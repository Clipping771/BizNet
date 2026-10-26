import { NextRequest, NextResponse } from "next/server";
import { getAuthzContext } from "@/lib/auth-user";
import { assertCan, AuthorizationError } from "@/lib/authz";
import { logOpsTime, getRecentOpsTimeLogs, getTotalOpsMinutes } from "@/lib/repo/ops-time";

export async function GET(req: NextRequest) {
  try {
    const { ctx: dbCtx, error: authError, status: authStatus } = await getAuthzContext(req);
    if (authError || !dbCtx) {
      return NextResponse.json({ error: authError || "Unauthorized" }, { status: authError ? authStatus : 401 });
    }

    const ctx = dbCtx;

    assertCan(ctx, "admin:access");

    const [logs, totalMinutes] = await Promise.all([
      getRecentOpsTimeLogs(50),
      getTotalOpsMinutes(),
    ]);

    return NextResponse.json({ logs, totalMinutes });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message || "Failed to load ops time" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ctx: dbCtx, error: authError, status: authStatus } = await getAuthzContext(req);
    if (authError || !dbCtx) {
      return NextResponse.json({ error: authError || "Unauthorized" }, { status: authError ? authStatus : 401 });
    }

    const ctx = dbCtx;

    assertCan(ctx, "admin:access");

    const body = await req.json();
    const { activity, minutes, refType, refId } = body;

    const logged = await logOpsTime({
      userId: dbCtx.userId,
      activity,
      minutes: Number(minutes),
      refType,
      refId,
    });

    return NextResponse.json({ success: true, log: logged });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message || "Failed to log ops time" }, { status: 400 });
  }
}
