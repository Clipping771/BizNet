"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { T, useLang, useT } from "@/components/ui/T";
import { EmptyState, ListSkeleton } from "@/components/ui/ListStates";
import { formatDate } from "@/lib/dates";
import { formatNumber } from "@/lib/money";

/** Inbox tab: every conversation of the active business, newest first, with unread badges (§8.12). */
export default function InboxPage() {
  const t = useT();
  const lang = useLang();
  const [conversations, setConversations] = useState<any[] | null>(null);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setConversations(Array.isArray(d) ? d : []))
      .catch(() => setConversations([]));
  }, []);

  return (
    <div className="max-w-md mx-auto space-y-4 pb-16">
      <h1 className="text-lg font-bold text-gray-900">
        <T k="inbox.conversations" />
      </h1>
      {conversations === null ? (
        <ListSkeleton />
      ) : conversations.length === 0 ? (
        <EmptyState k="inbox.noMessages" />
      ) : (
        <div id="conversation-list" className="space-y-2">
          {conversations.map((c) => {
            // The other side of the conversation is whichever business is not the viewer's
            const other = c.side === "BUYER" ? c.supplierBusiness : c.buyerBusiness;
            const last = c.messages?.[0];
            return (
              <Link key={c.id} href={`/inbox/${c.id}`} data-conversation={c.id} className="block bg-white rounded-2xl border border-gray-100 p-4 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{other?.name}</p>
                  {c.unread > 0 && (
                    <span data-unread={c.unread} className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-white">
                      {t("inbox.unread", undefined, { n: formatNumber(c.unread, lang) })}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">
                  {c.request?.title}
                  {" · "}
                  {formatDate(c.lastMessageAt, lang)}
                </p>
                <p className={`text-xs truncate ${c.unread > 0 ? "text-gray-900 font-semibold" : "text-gray-500"}`}>
                  {last?.body ?? t("inbox.noMessageYet")}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
