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
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-gray-950/50 backdrop-blur-[2px] sm:items-center sm:p-6">
      <div
        id="chat-panel"
        role="dialog"
        aria-modal="true"
        aria-label={chat.title}
        className="flex h-[85vh] w-full max-w-lg animate-fade-up flex-col gap-3 rounded-t-3xl bg-white p-4 shadow-pop sm:h-[min(720px,85vh)] sm:rounded-3xl sm:p-5"
      >
        <div className="mx-auto -mt-1 h-1 w-10 rounded-full bg-gray-200 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <h3 className="truncate text-base font-semibold text-gray-900">{chat.title}</h3>
          <button
            type="button"
            id="close-chat-btn"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        {other ? (
          <div id="contact-card" className="space-y-0.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
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
          <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
            <span>
              <T k="msg.contactNotice" />
            </span>
            {isBuyer && (
              <button type="button" id="show-contact-btn" onClick={reveal} className="btn btn-soft btn-sm shrink-0">
                <T k="msg.showContact" />
              </button>
            )}
          </div>
        )}

        <div ref={listRef} className="-mx-1 flex-1 space-y-2.5 overflow-y-auto px-1" id="chat-messages">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-400">
              <T k="msg.noMessages" />
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className="group rounded-2xl rounded-ss-md bg-gray-100/80 px-3.5 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-700">{m.senderBusiness?.name}</span>
                <button
                  type="button"
                  onClick={() => report(m.id)}
                  disabled={reported[m.id]}
                  className="flex items-center gap-0.5 text-[11px] text-gray-400 opacity-70 transition hover:text-rose-600 group-hover:opacity-100"
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
                className="mt-0.5 whitespace-pre-wrap text-gray-800"
              />
            </div>
          ))}
        </div>

        {blocked && (
          <p id="msg-soft-block" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {blocked}
          </p>
        )}
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}

        <form onSubmit={send} className="flex items-center gap-2 border-t border-gray-100 pt-3">
          <input
            id="chat-input"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("msg.typeMessage")}
            className="input flex-1"
          />
          <button
            type="submit"
            id="chat-send-btn"
            disabled={sending || !text.trim()}
            className="btn btn-primary h-11 w-11 shrink-0 px-0"
            aria-label={t("msg.send")}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
