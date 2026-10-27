/**
 * jobs/expire-requests.ts
 *
 * Runs every 15 minutes (§8.5, B4).
 * OPEN past closesAt -> CLOSED if quotes exist, else EXPIRED.
 */

import {
  findRequestsToExpire,
  closeRequestWithQuotes,
  expireRequestWithoutQuotes,
} from "@/lib/repo/jobs";
import { RequestStatus } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { logEvent } from "@/lib/events";

export async function runExpireRequestsJob(now: Date = new Date()) {
  const expiredRequests = await findRequestsToExpire(now);

  const results = {
    closedCount: 0,
    expiredCount: 0,
  };

  for (const req of expiredRequests) {
    const hasQuotes = req.quotes.length > 0;
    const nextStatus = hasQuotes ? RequestStatus.CLOSED : RequestStatus.EXPIRED;

    if (hasQuotes) {
      await closeRequestWithQuotes(req.id);
      results.closedCount++;
    } else {
      await expireRequestWithoutQuotes(req.id);
      results.expiredCount++;
    }

    await logAudit({
      actorUserId: null,
      actorBusinessId: req.buyerBusinessId,
      action: hasQuotes ? "REQUEST_AUTO_CLOSED" : "REQUEST_EXPIRED",
      entityType: "REQUEST",
      entityId: req.id,
      before: { status: RequestStatus.OPEN },
      after: { status: nextStatus, quotesCount: req.quotes.length },
    });

    await logEvent({
      name: hasQuotes ? "request_closed" : "request_expired",
      businessId: req.buyerBusinessId,
      props: { requestId: req.id, code: req.code, quotesCount: req.quotes.length },
    });
  }

  return results;
}
