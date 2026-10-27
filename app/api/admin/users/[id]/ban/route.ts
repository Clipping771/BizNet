import { NextResponse } from "next/server";
import { adminRouteWithParams } from "@/lib/admin/route";
import { setUserBanned } from "@/lib/repo/admin";

/** POST /api/admin/users/[id]/ban { banned: boolean, note? } — audited. */
export const POST = adminRouteWithParams<{ id: string }>("Ban user error", async (req, ctx, { id }) => {
  const body = await req.json();
  return NextResponse.json(await setUserBanned({ adminUserId: ctx.userId, userId: id, banned: body.banned === true, note: body.note ?? null }));
});
