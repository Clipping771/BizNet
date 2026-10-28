"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, X, Flag } from "lucide-react";
import { T, useT } from "@/components/ui/T";
import { TranslatableText } from "@/components/ui/TranslatableText";

export interface ChatState {
  conversationId: string;
  title: string;
}

/**
 * Conversation sheet (§8.12): polls every 10 s, soft-blocks contact details before a reveal,
 * "Show contact" for the buyer, report per message, on-demand translation.
 */
export function ChatPanel({
  chat,
  isBuyer,
  prefill,
  onClose,
}: {
  chat: ChatState;
  isBuyer: boolean;
  prefill: string;
  onClose: () => void;
}) {
  const t = useT();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState(prefill);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [contact, setContact] = useState<any>(null);
  const [reported, setReported] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [msgRes, visRes] = await Promise.all([
      fetch(`/api/conversations/${chat.conversationId}/messages`),
      fetch(`/api/conversations/${chat.conversationId}/reveal-contact`),
    ]);
    if (msgRes.ok) setMessages(await msgRes.json());
    if (visRes.ok) setContact(await visRes.json());
  }, [chat.conversationId]);

  // Poll every 10 s while the conversation is open (§8.12)
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setBlocked(null);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${chat.conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text.trim() }),
      });
      const json = await res.json();
      if (res.status === 422 && json.blocked) {
        // Soft block: nothing was sent; the user can edit and retry (§8.12)
        setBlocked(t("msg.contactNotice"));
        return;
      }
      if (!res.ok) {
        setError(json.error || t("common.tryAgain"));
        return;
      }
      setText("");
      setMessages((prev) => [...prev, json]);
    } finally {
      setSending(false);
    }
  };

  const reveal = async () => {
    const res = await fetch(`/api/conversations/${chat.conversationId}/reveal-contact`, { method: "POST" });
    if (!res.ok) setError((await res.json()).error || t("common.tryAgain"));
    await refresh();
  };

  const report = async (messageId: string) => {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "MESSAGE", targetId: messageId, reason: "USER_REPORT" }),
    });
    if (res.ok) setReported((prev) => ({ ...prev, [messageId]: true }));
  };

  const other = isBuyer ? contact?.supplierContact : contact?.buyerContact;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center">
      <div id="chat-panel" className="bg-white w-full max-w-md rounded-t-3xl p-4 space-y-3 h-[85vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">{chat.title}</h3>
          <button type="button" id="close-chat-btn" onClick={onClose} aria-label={t("common.close")}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {other ? (
          <div id="contact-card" className="text-[11px] bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 space-y-0.5">
            <p className="font-bold">
              {isBuyer ? t("msg.supplierContact") : t("msg.buyerContact")}
              {": "}
              {other.name}
            </p>
            {other.phonePublic && (
              <p>
                {t("msg.phone")}
                {": "}
                {other.phonePublic}
              </p>
            )}
            {other.whatsapp && (
              <p>
                {t("msg.whatsapp")}
                {": "}
                {other.whatsapp}
              </p>
            )}
            {other.addressLine && (
              <p>
                {t("msg.address")}
                {": "}
                {other.addressLine}
              </p>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-gray-500 bg-gray-50 rounded-xl p-2.5 flex items-center justify-between gap-2">
            <span>
              <T k="msg.contactNotice" />
            </span>
            {isBuyer && (
              <button type="button" id="show-contact-btn" onClick={reveal} className="shrink-0 font-bold text-primary">
                <T k="msg.showContact" />
              </button>
            )}
          </div>
        )}

        <div ref={listRef} className="flex-1 overflow-y-auto space-y-2" id="chat-messages">
          {messages.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-6">
              <T k="msg.noMessages" />
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className="text-xs bg-gray-50 rounded-xl p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-gray-700">{m.senderBusiness?.name}</span>
                <button
                  type="button"
                  onClick={() => report(m.id)}
                  disabled={reported[m.id]}
                  className="text-[10px] text-gray-400 flex items-center gap-0.5"
                >
                  <Flag className="w-3 h-3" />
                  {reported[m.id] ? t("msg.reported") : t("msg.report")}
                </button>
              </div>
              <TranslatableText
                entityType="MESSAGE"
                entityId={m.id}
                field="body"
                text={m.body}
                sourceLang={m.lang}
                className="whitespace-pre-wrap text-gray-800"
              />
            </div>
          ))}
        </div>

        {blocked && (
          <p id="msg-soft-block" className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2">
            {blocked}
          </p>
        )}
        {error && <p className="text-[11px] text-red-700">{error}</p>}

        <form onSubmit={send} className="flex items-center gap-2">
          <input
            id="chat-input"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("msg.typeMessage")}
            className="flex-1 text-xs p-2.5 rounded-xl border border-gray-200"
          />
          <button
            type="submit"
            id="chat-send-btn"
            disabled={sending || !text.trim()}
            className="p-2.5 rounded-xl bg-primary text-white disabled:opacity-50"
            aria-label={t("msg.send")}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
