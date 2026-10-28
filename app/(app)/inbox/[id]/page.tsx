"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { T, useT } from "@/components/ui/T";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { EmptyState } from "@/components/ui/ListStates";

/** One conversation opened from the inbox (§7 /inbox/[id]). */
export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const router = useRouter();
  const [conversation, setConversation] = useState<any>(undefined);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setConversation(Array.isArray(list) ? list.find((c: any) => c.id === id) ?? null : null))
      .catch(() => setConversation(null));
  }, [id]);

  if (conversation === undefined) return null;
  if (conversation === null) {
    return (
      <div className="max-w-md mx-auto space-y-3">
        <EmptyState k="list.empty" />
        <Link href="/inbox" className="text-primary text-sm font-semibold">
          <T k="inbox.back" />
        </Link>
      </div>
    );
  }

  const isBuyer = conversation.side === "BUYER";
  const other = isBuyer ? conversation.supplierBusiness : conversation.buyerBusiness;
  return (
    <div className="max-w-md mx-auto space-y-3">
      <Link href={`/requests/${conversation.request.code}`} className="block text-xs text-primary font-semibold">
        {conversation.request.title}
      </Link>
      <ChatPanel
        chat={{ conversationId: conversation.id, title: isBuyer ? t("msg.withSupplier", undefined, { name: other.name }) : other.name }}
        isBuyer={isBuyer}
        prefill=""
        onClose={() => router.push("/inbox")}
      />
    </div>
  );
}
