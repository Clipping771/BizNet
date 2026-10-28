"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useLang, useT } from "@/components/ui/T";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/ui/ListStates";
import { initials } from "@/components/layout/AccountMenu";
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
    <div className="page space-y-5">
      <PageHeader titleKey="inbox.conversations" />
      {conversations === null ? (
        <ListSkeleton />
      ) : conversations.length === 0 ? (
        <EmptyState k="inbox.noMessages" icon={MessageSquare} />
      ) : (
        <div id="conversation-list" className="card divide-y divide-gray-100 overflow-hidden">
          {conversations.map((c) => {
            // The other side of the conversation is whichever business is not the viewer's
            const other = c.side === "BUYER" ? c.supplierBusiness : c.buyerBusiness;
            const last = c.messages?.[0];
            const unread = c.unread > 0;
            return (
              <Link key={c.id} href={`/inbox/${c.id}`} data-conversation={c.id} className="flex items-start gap-3.5 px-4 py-3.5 transition hover:bg-gray-50">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-100 to-primary-200 text-sm font-bold text-primary-800">
                  {initials(other?.name || "?")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`truncate text-sm ${unread ? "font-bold text-gray-900" : "font-semibold text-gray-800"}`}>{other?.name}</p>
                    <span className={`shrink-0 text-[11px] ${unread ? "font-semibold text-primary-700" : "text-gray-400"}`}>{formatDate(c.lastMessageAt, lang)}</span>
                  </div>
                  <p className="truncate text-xs text-gray-500">{c.request?.title}</p>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className={`truncate text-sm ${unread ? "font-medium text-gray-900" : "text-gray-500"}`}>{last?.body ?? t("inbox.noMessageYet")}</p>
                    {unread && (
                      <span
                        data-unread={c.unread}
                        aria-label={t("inbox.unread", undefined, { n: formatNumber(c.unread, lang) })}
                        className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white"
                      >
                        {formatNumber(c.unread, lang)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
