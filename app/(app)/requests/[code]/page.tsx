"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
  Send,
  ChevronRight,
  Paperclip,
  X,
  Flag,
} from "lucide-react";
import { T, useT, useLang } from "@/components/ui/T";
import { AiChip } from "@/components/ai/AiChip";
import { VerificationBadge } from "@/components/business/VerificationBadge";
import { formatMoney, calculateQuoteTotal } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { TranslatableText } from "@/components/ui/TranslatableText";

const PRIORITIES = ["BALANCED", "PRICE", "SPEED", "PAYMENT_TERMS"];
const PAYMENT_TERMS = ["CASH_ON_DELIVERY", "ADVANCE", "CREDIT_7", "CREDIT_15", "CREDIT_30", "OTHER"];
const SPEC_STATUSES = ["MATCH", "DIFFERENT", "NOT_STATED"];
const LIVE_QUOTE_STATUSES = ["SUBMITTED", "REVISED"];

type SpecRow = { field: string; requested: unknown; status: string; offered: string | null };

interface CompareRow {
  quoteId: string;
  quoteRef: string;
  supplier: { id: string; name: string; area: string | null; verificationStatus: string };
  unitPrice: string;
  quantity: string;
  deliveryCharge: string;
  totalPrice: string;
  deliveryDays: number;
  estimatedArrival: string;
  isLate: boolean;
  paymentTerm: string;
  paymentTermMatches: boolean;
  specMatch: SpecRow[];
  validUntil: string;
  notes: string | null;
  lang: string;
  attachmentKeys: string[];
  status: string;
  tags: string[];
  isBestFit: boolean;
  reliability: { feedbackCount: number; onTimeCount: number; onTimeAnswered: number } | null;
}

interface ChatState {
  conversationId: string;
  title: string;
}

interface RequestDetailProps {
  params: Promise<{ code: string }>;
}

export default function RequestDetailPage({ params }: RequestDetailProps) {
  const { code } = use(params);
  const t = useT();
  const lang = useLang();
  const router = useRouter();

  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Buyer: comparison
  const [priority, setPriority] = useState<string | null>(null);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [orderRow, setOrderRow] = useState<CompareRow | null>(null);
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Messaging
  const [chat, setChat] = useState<ChatState | null>(null);
  const [chatPrefill, setChatPrefill] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const role: "BUYER" | "SUPPLIER" | "ADMIN" | null = request?.viewerRole ?? null;
  const isBuyerSide = role === "BUYER" || role === "ADMIN";
  const categorySlug: string = request?.category?.slug ?? "";
  const schemaFields: any[] = useMemo(() => request?.category?.attributeSchema?.fields ?? [], [request]);
  const fieldLabel = useCallback((key: string) => t(`attr.${categorySlug}.${key}.label`), [t, categorySlug]);
  const valueLabel = useCallback(
    (key: string, value: unknown): string => {
      if (value === null || value === undefined || value === "") return t("rfq.notSet");
      if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
      if (Array.isArray(value)) return value.map((v) => valueLabel(key, v)).join(", ");
      const field = schemaFields.find((f) => f.key === key);
      if (field?.options?.includes(String(value))) return t(`attr.${categorySlug}.${key}.opt.${value}`);
      return field?.unit ? `${value} ${field.unit}` : String(value);
    },
    [t, categorySlug, schemaFields]
  );

  const loadRequest = useCallback(async () => {
    const res = await fetch(`/api/requests/${encodeURIComponent(code)}`);
    if (!res.ok) {
      setNotFound(true);
      return null;
    }
    const json = await res.json();
    setRequest(json);
    return json;
  }, [code]);

  const loadComparison = useCallback(
    async (chosen: string | null, withAi = false) => {
      const res = await fetch("/api/quotes/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestCode: code, priority: chosen ?? undefined, withAi }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      setRows(json.rows || []);
      if (!chosen && json.request?.priority) setPriority(json.request.priority);
      return json;
    },
    [code]
  );

  const reload = useCallback(async () => {
    const req = await loadRequest();
    if (req && (req.viewerRole === "BUYER" || req.viewerRole === "ADMIN")) {
      await loadComparison(priority);
    }
  }, [loadRequest, loadComparison, priority]);

  useEffect(() => {
    (async () => {
      await reload();
      setLoading(false);
    })();
    // Priority changes reload only the comparison (see onPriority)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const onPriority = async (p: string) => {
    setPriority(p);
    setAiAnalysis(null);
    setAiUnavailable(false);
    await loadComparison(p);
  };

  const handleCompareWithAi = async () => {
    setLoadingAi(true);
    setAiUnavailable(false);
    try {
      const json = await loadComparison(priority, true);
      if (json?.aiAnalysis) setAiAnalysis(json.aiAnalysis);
      else setAiUnavailable(true);
    } finally {
      setLoadingAi(false);
    }
  };

  const openChat = async (supplierBusinessId: string, title: string, prefill?: string) => {
    setActionError(null);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: request.id, supplierBusinessId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionError(json.error || t("common.tryAgain"));
      return;
    }
    setChatPrefill(prefill || "");
    setChat({ conversationId: json.id, title });
  };

  const handleConfirmOrder = async () => {
    if (!orderRow) return;
    setConfirmingOrder(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/quotes/${orderRow.quoteId}/accept`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || t("common.tryAgain"));
        setOrderRow(null);
        await reload();
        return;
      }
      router.push(`/orders/${json.code}`);
    } finally {
      setConfirmingOrder(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!cancelReason.trim()) return;
    const res = await fetch(`/api/requests/${request.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: cancelReason.trim() }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionError(json.error || t("common.tryAgain"));
      return;
    }
    setShowCancel(false);
    await reload();
  };

  const openFile = async (key: string) => {
    const res = await fetch(`/api/files/${key.split("/").map(encodeURIComponent).join("/")}`);
    if (res.ok) {
      const json = await res.json();
      window.open(json.url, "_blank", "noopener");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (notFound || !request) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <p id="request-not-found" className="text-sm text-gray-600">
          <T k="rfq.notFound" />
        </p>
        <Link href="/requests" className="text-primary text-sm font-bold underline">
          <T k="common.returnHome" />
        </Link>
      </div>
    );
  }

  const attributes: Record<string, unknown> = request.attributes || {};
  const rowById = (id: string | null | undefined) => rows.find((r) => r.quoteId === id) || null;

  return (
    <div className="max-w-md mx-auto space-y-4 pb-16">
      {/* Request summary */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold text-gray-400">{request.code}</span>
          <span
            id="request-status-badge"
            data-status={request.status}
            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"
          >
            <T k={`reqStatus.${request.status}`} />
          </span>
        </div>

        <h1 id="request-title-heading" className="text-base font-bold text-gray-900">
          {request.title}
        </h1>

        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 p-3 rounded-2xl">
          <Info label={t("rfq.quantity")} value={`${Number(request.quantity)} ${request.unit}`} />
          <Info label={t("rfq.deliveryArea")} value={request.deliveryArea} />
          <Info
            label={t("rfq.neededBy")}
            value={request.neededBy ? formatDate(request.neededBy, lang) : t("rfq.notSet")}
          />
          <Info
            label={t("rfq.paymentTerm")}
            value={request.preferredPaymentTerm ? t(`payterm.${request.preferredPaymentTerm}`) : t("rfq.notSet")}
          />
          <Info label={t("rfq.priority")} value={t(`priority.${request.priority}`)} />
          {request.closesAt && request.status === "OPEN" && (
            <Info
              label={t("rfq.quoteWindow")}
              value={t("rfq.closesAt", undefined, { date: formatDate(request.closesAt, lang) })}
            />
          )}
        </div>

        {Object.keys(attributes).length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-gray-500">
              <T k="rfq.specification" />
            </p>
            <ul className="text-xs text-gray-700 space-y-0.5">
              {Object.entries(attributes).map(([key, value]) => (
                <li key={key} className="flex justify-between gap-2">
                  <span className="text-gray-500">{fieldLabel(key)}</span>
                  <span className="font-semibold">{valueLabel(key, value)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {request.budgetNote && (
          <p className="text-xs text-gray-600">
            <span className="font-bold">
              <T k="rfq.budgetNote" />
              {": "}
            </span>
            {request.budgetNote}
          </p>
        )}

        <div className="flex items-center justify-between pt-1 text-xs">
          {role === "BUYER" && request.status === "OPEN" && (
            <button
              type="button"
              id="cancel-request-btn"
              onClick={() => setShowCancel(true)}
              className="text-red-500 font-semibold hover:underline"
            >
              <T k="rfq.cancelRequest" />
            </button>
          )}
          {request.order && (
            <Link
              href={`/orders/${request.order.code}`}
              id="view-order-link"
              className="text-primary font-bold hover:underline flex items-center gap-1"
            >
              <span>
                <T k="order.viewOrder" />
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {actionError && (
        <div id="action-error" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-2xl p-3">
          {actionError}
        </div>
      )}

      {role === "SUPPLIER" && (
        <SupplierPanel
          request={request}
          schemaFields={schemaFields}
          fieldLabel={fieldLabel}
          valueLabel={valueLabel}
          onChanged={reload}
          onError={setActionError}
          onOpenChat={(supplierId) => openChat(supplierId, t("msg.withBuyer"))}
          openFile={openFile}
        />
      )}

      {isBuyerSide && (
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-0.5">
              <h2 className="text-sm font-bold text-gray-900">
                <T k="quote.comparisonTitle" />
              </h2>
              <p className="text-[11px] text-gray-400">
                <T k="quote.comparisonSubtitle" />
              </p>
            </div>
            {rows.length > 0 && (
              <button
                type="button"
                id="compare-with-ai-btn"
                onClick={handleCompareWithAi}
                disabled={loadingAi}
                className="shrink-0 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {loadingAi ? t("common.loading") : t("quote.compareWithAi")}
              </button>
            )}
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                id={`comp-priority-${p}`}
                onClick={() => onPriority(p)}
                className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold border ${
                  priority === p ? "bg-primary text-white border-primary" : "bg-gray-50 text-gray-600 border-gray-200"
                }`}
              >
                <T k={`priority.${p}`} />
              </button>
            ))}
          </div>

          {aiUnavailable && (
            <p id="ai-unavailable" className="text-[11px] text-gray-500 bg-gray-50 rounded-xl p-2.5">
              <T k="cmp.aiUnavailable" />
            </p>
          )}

          {aiAnalysis && (
            <div id="ai-panel" className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-primary">
                  <T k="quote.aiEvaluation" />
                </span>
                <AiChip showFeedback={true} />
              </div>
              <p id="ai-label" className="text-[11px] font-semibold text-gray-600">
                <T k="cmp.aiLabel" />
              </p>
              {aiAnalysis.summaryText && (
                <p
                  id="ai-summary-text"
                  className="text-xs text-gray-700 italic bg-white/60 p-2.5 rounded-xl border border-primary/10"
                >
                  {aiAnalysis.summaryText}
                </p>
              )}
              {aiAnalysis.bestFitForPriority?.quoteId && rowById(aiAnalysis.bestFitForPriority.quoteId) && (
                <div
                  id="ai-best-fit"
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>
                    <T k="quote.bestFit" />
                    {": "}
                    {rowById(aiAnalysis.bestFitForPriority.quoteId)!.supplier.name}
                  </span>
                </div>
              )}
              {(aiAnalysis.perQuote || []).map((pq: any) => {
                const row = rowById(pq.quoteId);
                if (!row || (pq.strengths.length === 0 && pq.concerns.length === 0)) return null;
                return (
                  <div key={pq.quoteId} className="text-xs space-y-1">
                    <p className="font-bold text-gray-800">{row.supplier.name}</p>
                    {pq.strengths.map((s: any, i: number) => (
                      <p key={`s${i}`} className="text-emerald-700 flex gap-1">
                        <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>
                          {t(`cmp.strength.${s.code}`, undefined, { field: s.field ? fieldLabel(s.field) : "" })}
                        </span>
                      </p>
                    ))}
                    {pq.concerns.map((c: any, i: number) => (
                      <p key={`c${i}`} className="text-amber-700 flex gap-1">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>
                          {c.code === "ARRIVES_AFTER_NEEDED_BY" && request.neededBy
                            ? t("cmp.arrivesLateOn", undefined, {
                                date: formatDate(row.estimatedArrival, lang),
                                neededBy: formatDate(request.neededBy, lang),
                              })
                            : t(`cmp.concern.${c.code}`, undefined, { field: c.field ? fieldLabel(c.field) : "" })}
                        </span>
                      </p>
                    ))}
                  </div>
                );
              })}
              {(aiAnalysis.suggestedQuestions || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {aiAnalysis.suggestedQuestions.map((q: any, i: number) => {
                    const row = rowById(q.quoteId);
                    if (!row) return null;
                    const question = t("cmp.questionTemplate", undefined, { field: fieldLabel(q.field) });
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          openChat(row.supplier.id, t("msg.withSupplier", undefined, { name: row.supplier.name }), question)
                        }
                        className="text-[11px] px-2.5 py-1 rounded-full bg-white border border-primary/30 text-primary"
                      >
                        {row.supplier.name}
                        {" · "}
                        {t("cmp.askQuestion", undefined, { field: fieldLabel(q.field) })}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {rows.map((row) => (
              <QuoteCard
                key={row.quoteId}
                row={row}
                request={request}
                lang={lang}
                fieldLabel={fieldLabel}
                valueLabel={valueLabel}
                canChoose={role === "BUYER" && request.status === "OPEN" && LIVE_QUOTE_STATUSES.includes(row.status)}
                onChoose={() => setOrderRow(row)}
                onMessage={() =>
                  openChat(row.supplier.id, t("msg.withSupplier", undefined, { name: row.supplier.name }))
                }
                openFile={openFile}
              />
            ))}
            {rows.length === 0 && (
              <div id="no-quotes" className="text-center py-6 text-xs text-gray-400">
                <T k="quote.noQuotes" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order confirmation sheet (§8.9): original key terms + explicit confirm */}
      {orderRow && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-900">
              <T k="quote.confirmOrderSheet" />
            </h3>
            <p className="text-xs font-semibold text-gray-700">{orderRow.supplier.name}</p>
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2 text-xs">
              <SheetLine label={t("quote.unitPriceShort")} value={formatMoney(orderRow.unitPrice, lang)} />
              <SheetLine label={t("rfq.quantity")} value={`${Number(orderRow.quantity)} ${request.unit}`} />
              <SheetLine label={t("quote.deliveryCharge")} value={formatMoney(orderRow.deliveryCharge, lang)} />
              <SheetLine label={t("quote.totalPrice")} value={formatMoney(orderRow.totalPrice, lang)} strong />
              <SheetLine label={t("quote.deliveryDays")} value={`${orderRow.deliveryDays} ${t("public.days")}`} />
              <SheetLine label={t("quote.paymentTerm")} value={t(`payterm.${orderRow.paymentTerm}`)} />
              {orderRow.specMatch
                .filter((s) => s.status !== "MATCH")
                .map((s) => (
                  <SheetLine
                    key={s.field}
                    label={fieldLabel(s.field)}
                    value={
                      s.status === "DIFFERENT"
                        ? t("cmp.specOffered", undefined, { value: s.offered ?? "" })
                        : t("quote.notStated")
                    }
                  />
                ))}
            </div>
            <p
              id="order-terms-final-notice"
              className="text-[11px] text-gray-500 italic bg-amber-50 p-3 rounded-xl border border-amber-200"
            >
              <T k="quote.termsFinalNotice" />
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOrderRow(null)}
                className="py-3 px-4 rounded-xl border border-gray-200 text-xs font-bold text-gray-600"
              >
                <T k="common.cancel" />
              </button>
              <button
                type="button"
                id="confirm-order-action-btn"
                onClick={handleConfirmOrder}
                disabled={confirmingOrder}
                className="flex-1 py-3 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50"
              >
                {confirmingOrder ? t("common.loading") : t("quote.confirmOrder")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancel && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-gray-900">
              <T k="rfq.cancelRequest" />
            </h3>
            <label className="text-xs font-bold text-gray-700 block">
              <T k="rfq.cancelReason" />
            </label>
            <textarea
              id="cancel-reason-input"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t("rfq.cancelPlaceholder")}
              className="w-full text-xs p-3 rounded-xl border border-gray-200 outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCancel(false)}
                className="py-2.5 px-4 rounded-xl border border-gray-200 text-xs font-bold text-gray-600"
              >
                <T k="common.cancel" />
              </button>
              <button
                type="button"
                id="submit-cancel-request-btn"
                onClick={handleCancelRequest}
                disabled={!cancelReason.trim()}
                className="flex-1 py-2.5 bg-red-600 text-white text-xs font-bold rounded-xl disabled:opacity-50"
              >
                <T k="common.confirm" />
              </button>
            </div>
          </div>
        </div>
      )}

      {chat && (
        <ChatPanel
          chat={chat}
          isBuyer={role === "BUYER"}
          prefill={chatPrefill}
          onClose={() => {
            setChat(null);
            setChatPrefill("");
          }}
        />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-400 block">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function SheetLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className={strong ? "font-bold text-primary" : "font-bold text-gray-900"}>{value}</span>
    </div>
  );
}

function QuoteCard({
  row,
  request,
  lang,
  fieldLabel,
  valueLabel,
  canChoose,
  onChoose,
  onMessage,
  openFile,
}: {
  row: CompareRow;
  request: any;
  lang: string;
  fieldLabel: (key: string) => string;
  valueLabel: (key: string, value: unknown) => string;
  canChoose: boolean;
  onChoose: () => void;
  onMessage: () => void;
  openFile: (key: string) => void;
}) {
  const t = useT();
  return (
    <div
      id={`quote-card-${row.quoteRef}`}
      data-supplier={row.supplier.name}
      className={`p-4 rounded-2xl border space-y-3 ${
        row.isBestFit ? "border-emerald-300 bg-emerald-50/20 shadow-sm" : "border-gray-100 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-xs text-gray-900 truncate">{row.supplier.name}</span>
            <VerificationBadge status={row.supplier.verificationStatus as any} />
          </div>
          {row.supplier.area && <p className="text-[11px] text-gray-400">{row.supplier.area}</p>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-primary">{formatMoney(row.totalPrice, lang)}</div>
          {row.isBestFit && (
            <span
              id={`best-fit-badge-${row.quoteRef}`}
              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800"
            >
              <T k="quote.bestFit" />
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
        <Info label={t("quote.unitPriceShort")} value={formatMoney(row.unitPrice, lang)} />
        <Info label={t("quote.deliveryCharge")} value={formatMoney(row.deliveryCharge, lang)} />
        <Info label={t("quote.delivery")} value={`${row.deliveryDays} ${t("public.days")}`} />
        <Info label={t("quote.validUntil")} value={formatDate(row.validUntil, lang)} />
      </div>

      {row.isLate ? (
        <div
          id={`quote-late-warning-${row.quoteRef}`}
          className="flex items-start gap-1 text-[11px] font-semibold text-red-600 bg-red-50 p-2 rounded-xl"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {request.neededBy
              ? t("cmp.arrivesLateOn", undefined, {
                  date: formatDate(row.estimatedArrival, lang),
                  neededBy: formatDate(request.neededBy, lang),
                })
              : t("quote.arrivesLate")}
          </span>
        </div>
      ) : (
        <p className="text-[11px] text-gray-500">
          {t("cmp.arrivesOn", undefined, { date: formatDate(row.estimatedArrival, lang) })}
        </p>
      )}

      <div className="text-xs">
        <span className="font-semibold text-gray-800">{t(`payterm.${row.paymentTerm}`)}</span>
        {request.preferredPaymentTerm && (
          <span className={`ms-1.5 text-[11px] ${row.paymentTermMatches ? "text-emerald-700" : "text-amber-700"}`}>
            {row.paymentTermMatches ? t("cmp.termMatches") : t("cmp.termDiffers")}
          </span>
        )}
      </div>

      {row.specMatch.length > 0 && (
        <ul className="text-[11px] space-y-0.5" id={`spec-match-${row.quoteRef}`}>
          {row.specMatch.map((s) => (
            <li key={s.field} className="flex justify-between gap-2">
              <span className="text-gray-500">{fieldLabel(s.field)}</span>
              <span
                data-spec-status={s.status}
                className={
                  s.status === "MATCH"
                    ? "text-emerald-700 font-semibold"
                    : s.status === "DIFFERENT"
                    ? "text-amber-700 font-semibold"
                    : "text-gray-400"
                }
              >
                {s.status === "MATCH"
                  ? `✓ ${valueLabel(s.field, s.requested)}`
                  : s.status === "DIFFERENT"
                  ? `≠ ${s.offered ?? ""}`
                  : `? ${t("quote.notStated")}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-gray-500">
        <span className="font-semibold">
          {t("cmp.reliability")}
          {": "}
        </span>
        {row.reliability
          ? t("quote.onTimeCount", undefined, {
              count: row.reliability.onTimeCount,
              total: row.reliability.onTimeAnswered,
            })
          : t("quote.notEnoughHistory")}
      </p>

      {row.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {row.tags.map((tag) => (
            <span key={tag} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              <T k={`cmp.tag.${tag}`} />
            </span>
          ))}
        </div>
      )}

      {row.notes && (
        <TranslatableText
          entityType="QUOTE"
          entityId={row.quoteId}
          field="notes"
          text={row.notes}
          sourceLang={row.lang}
          className="text-[11px] text-gray-600 whitespace-pre-wrap"
        />
      )}

      {row.attachmentKeys.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {row.attachmentKeys.map((key, i) => (
            <button
              key={key}
              type="button"
              onClick={() => openFile(key)}
              className="text-[11px] text-primary underline flex items-center gap-1"
            >
              <Paperclip className="w-3 h-3" />
              {t("quote.viewFile", undefined, { n: i + 1 })}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          id={`message-supplier-btn-${row.quoteRef}`}
          onClick={onMessage}
          className="py-2 px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 flex items-center gap-1"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <T k="msg.open" />
        </button>
        {canChoose && (
          <button
            type="button"
            id={`choose-quote-btn-${row.quoteRef}`}
            onClick={onChoose}
            className="flex-1 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-hover shadow-sm"
          >
            <T k="quote.chooseThis" />
          </button>
        )}
      </div>
    </div>
  );
}

function SupplierPanel({
  request,
  schemaFields,
  fieldLabel,
  valueLabel,
  onChanged,
  onError,
  onOpenChat,
  openFile,
}: {
  request: any;
  schemaFields: any[];
  fieldLabel: (key: string) => string;
  valueLabel: (key: string, value: unknown) => string;
  onChanged: () => Promise<void>;
  onError: (msg: string | null) => void;
  onOpenChat: (supplierBusinessId: string) => void;
  openFile: (key: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const myQuote = request.quotes?.[0] ?? null;
  const myInvite = request.invites?.[0] ?? null;
  const supplierId: string | null = myQuote?.supplierBusinessId ?? myInvite?.supplierBusinessId ?? null;
  const comparable = schemaFields.filter((f) => f.comparable);
  const isOpen = request.status === "OPEN";
  const canEdit = isOpen && (!myQuote || !["ACCEPTED", "REJECTED"].includes(myQuote.status));

  const [showForm, setShowForm] = useState(false);
  const [unitPrice, setUnitPrice] = useState("");
  const [quantity, setQuantity] = useState(String(Number(request.quantity)));
  const [deliveryCharge, setDeliveryCharge] = useState("0");
  const [deliveryDays, setDeliveryDays] = useState("2");
  const [paymentTerm, setPaymentTerm] = useState<string>(request.preferredPaymentTerm || "CASH_ON_DELIVERY");
  const [validDays, setValidDays] = useState("3");
  const [notes, setNotes] = useState("");
  const [spec, setSpec] = useState<Record<string, string>>({});
  const [offered, setOffered] = useState<Record<string, string>>({});
  const [attachmentKeys, setAttachmentKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outOfCredits, setOutOfCredits] = useState(false);

  // Revising / re-submitting starts from the existing quote
  const openForm = () => {
    if (myQuote) {
      setUnitPrice(String(Number(myQuote.unitPrice)));
      setQuantity(String(Number(myQuote.quantity)));
      setDeliveryCharge(String(Number(myQuote.deliveryCharge)));
      setDeliveryDays(String(myQuote.deliveryDays));
      setPaymentTerm(myQuote.paymentTerm);
      setNotes(myQuote.notes || "");
      const match = (myQuote.specMatch || {}) as Record<string, any>;
      const nextSpec: Record<string, string> = {};
      for (const f of comparable) if (typeof match[f.key] === "string") nextSpec[f.key] = match[f.key];
      setSpec(nextSpec);
      setOffered({ ...(match._offered || {}) });
      setAttachmentKeys(myQuote.attachmentKeys || []);
    }
    setShowForm(true);
  };

  const uploadFile = async (file: File) => {
    if (attachmentKeys.length >= 3) return;
    setUploading(true);
    onError(null);
    try {
      const ticketRes = await fetch("/api/files/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          purpose: "quote_attachment",
        }),
      });
      const ticket = await ticketRes.json();
      if (!ticketRes.ok) throw new Error(ticket.error);
      const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error((await put.json().catch(() => ({}))).error);
      setAttachmentKeys((prev) => [...prev, ticket.key]);
    } catch (err: any) {
      onError(err?.message || t("common.tryAgain"));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    onError(null);
    try {
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + Math.max(1, Number(validDays) || 1));
      const specMatch: Record<string, unknown> = {};
      const offeredValues: Record<string, string> = {};
      for (const f of comparable) {
        const status = spec[f.key] || "NOT_STATED";
        specMatch[f.key] = status;
        if (status === "DIFFERENT") offeredValues[f.key] = offered[f.key] || "";
      }
      if (Object.keys(offeredValues).length > 0) specMatch._offered = offeredValues;

      const res = await fetch(`/api/requests/${request.id}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitPrice,
          quantity,
          deliveryCharge: deliveryCharge || "0",
          deliveryDays: Number(deliveryDays),
          paymentTerm,
          validUntil: validUntil.toISOString(),
          specMatch,
          notes: notes.trim() || null,
          attachmentKeys,
        }),
      });
      const json = await res.json();
      if (res.status === 402 && json.code === "INSUFFICIENT_CREDITS") {
        setOutOfCredits(true);
        return;
      }
      if (!res.ok) {
        onError(json.error || t("common.tryAgain"));
        return;
      }
      setShowForm(false);
      await onChanged();
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async () => {
    if (!myQuote || !window.confirm(t("quote.withdrawConfirm"))) return;
    const res = await fetch(`/api/quotes/${myQuote.id}/withdraw`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) onError(json.error || t("common.tryAgain"));
    await onChanged();
  };

  let liveTotal = "0";
  try {
    liveTotal = calculateQuoteTotal(unitPrice || 0, quantity || 0, deliveryCharge || 0).toString();
  } catch {
    liveTotal = "0";
  }

  return (
    <div className="space-y-4">
      {myQuote && (
        <div id="my-quote-card" className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">
              <T k="quote.yourQuote" />
            </h2>
            <span
              id="my-quote-status"
              data-status={myQuote.status}
              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700"
            >
              <T k={`quoteStatus.${myQuote.status}`} />
            </span>
          </div>
          <p className="text-gray-400">{t("quote.versionLabel", undefined, { v: myQuote.version })}</p>
          <SheetLine label={t("quote.unitPriceShort")} value={formatMoney(myQuote.unitPrice, lang)} />
          <SheetLine label={t("quote.deliveryCharge")} value={formatMoney(myQuote.deliveryCharge, lang)} />
          <SheetLine label={t("quote.totalPrice")} value={formatMoney(myQuote.totalPrice, lang)} strong />
          <SheetLine label={t("quote.deliveryDays")} value={`${myQuote.deliveryDays} ${t("public.days")}`} />
          <SheetLine label={t("quote.paymentTerm")} value={t(`payterm.${myQuote.paymentTerm}`)} />
          <SheetLine label={t("quote.validUntil")} value={formatDate(myQuote.validUntil, lang)} />
          {(myQuote.attachmentKeys || []).map((key: string, i: number) => (
            <button key={key} type="button" onClick={() => openFile(key)} className="text-[11px] text-primary underline me-2">
              {t("quote.viewFile", undefined, { n: i + 1 })}
            </button>
          ))}
          {!isOpen && (
            <p className="text-gray-500 pt-1">
              <T k="quote.readOnly" />
            </p>
          )}
          {isOpen && LIVE_QUOTE_STATUSES.includes(myQuote.status) && (
            <button type="button" id="withdraw-quote-btn" onClick={withdraw} className="text-red-500 font-semibold hover:underline">
              <T k="quote.withdraw" />
            </button>
          )}
        </div>
      )}

      {supplierId && (
        <button
          type="button"
          id="message-buyer-btn"
          onClick={() => onOpenChat(supplierId)}
          className="w-full py-2.5 rounded-2xl border border-gray-200 bg-white text-xs font-bold text-gray-700 flex items-center justify-center gap-1.5"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <T k="msg.withBuyer" />
        </button>
      )}

      {canEdit && !showForm && (
        <button
          type="button"
          id="open-quote-form-btn"
          onClick={openForm}
          className="w-full py-3 bg-emerald-600 text-white text-xs font-bold rounded-2xl hover:bg-emerald-700 shadow-sm"
        >
          {!myQuote ? t("quote.submit") : myQuote.status === "WITHDRAWN" ? t("quote.resubmit") : t("quote.revise")}
        </button>
      )}

      {canEdit && showForm && (
        <form id="quote-form" onSubmit={submit} className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
          <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            <T k="quote.submit" />
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("quote.unitPrice")}>
              <input
                id="quote-unit-price-input"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-gray-200"
              />
            </Field>
            <Field label={t("rfq.quantity")}>
              <input
                id="quote-quantity-input"
                type="number"
                step="any"
                min="0.001"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-gray-200"
              />
            </Field>
            <Field label={t("quote.deliveryCharge")}>
              <input
                id="quote-delivery-charge-input"
                type="number"
                step="0.01"
                min="0"
                value={deliveryCharge}
                onChange={(e) => setDeliveryCharge(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-gray-200"
              />
            </Field>
            <Field label={t("quote.deliveryDays")}>
              <input
                id="quote-delivery-days-input"
                type="number"
                min="0"
                max="365"
                required
                value={deliveryDays}
                onChange={(e) => setDeliveryDays(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-gray-200"
              />
            </Field>
            <Field label={t("quote.validForDays")}>
              <input
                id="quote-valid-days-input"
                type="number"
                min="1"
                max="60"
                required
                value={validDays}
                onChange={(e) => setValidDays(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-gray-200"
              />
            </Field>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-bold text-gray-700">
              <T k="quote.paymentTerm" />
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENT_TERMS.map((pt) => (
                <button
                  key={pt}
                  type="button"
                  id={`quote-payterm-${pt}`}
                  onClick={() => setPaymentTerm(pt)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                    paymentTerm === pt ? "bg-primary text-white border-primary" : "bg-gray-50 text-gray-600 border-gray-200"
                  } ${request.preferredPaymentTerm === pt ? "ring-2 ring-amber-300" : ""}`}
                >
                  <T k={`payterm.${pt}`} />
                </button>
              ))}
            </div>
            {request.preferredPaymentTerm && (
              <p className="text-[10px] text-amber-700">
                {t(`payterm.${request.preferredPaymentTerm}`)}
                {" · "}
                <T k="quote.buyerPrefers" />
              </p>
            )}
          </div>

          {comparable.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-700">
                <T k="quote.specMatch" />
              </p>
              {comparable.map((f) => (
                <div key={f.key} className="space-y-1">
                  <p className="text-[11px] text-gray-600">
                    {fieldLabel(f.key)}
                    {" · "}
                    {t("cmp.specRequested", undefined, { value: valueLabel(f.key, request.attributes?.[f.key]) })}
                  </p>
                  <div className="flex gap-1.5">
                    {SPEC_STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        id={`spec-${f.key}-${s}`}
                        onClick={() => setSpec((prev) => ({ ...prev, [f.key]: s }))}
                        className={`px-2.5 py-1 rounded-full text-[11px] border ${
                          (spec[f.key] || "NOT_STATED") === s
                            ? "bg-primary text-white border-primary"
                            : "bg-gray-50 text-gray-600 border-gray-200"
                        }`}
                      >
                        {s === "MATCH" ? t("quote.match") : s === "DIFFERENT" ? t("quote.different") : t("quote.notStated")}
                      </button>
                    ))}
                  </div>
                  {spec[f.key] === "DIFFERENT" && (
                    <input
                      id={`spec-offered-${f.key}`}
                      required
                      maxLength={100}
                      value={offered[f.key] || ""}
                      onChange={(e) => setOffered((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={t("quote.offeredValue")}
                      className="w-full text-xs p-2 rounded-xl border border-gray-200"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <Field label={t("quote.notes")}>
            <textarea
              id="quote-notes-input"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl border border-gray-200"
            />
          </Field>

          <div className="space-y-1">
            <p className="text-xs font-bold text-gray-700">
              <T k="quote.attachments" />
            </p>
            {attachmentKeys.map((key, i) => (
              <div key={key} className="flex items-center gap-2 text-[11px]">
                <span>{t("quote.viewFile", undefined, { n: i + 1 })}</span>
                <button
                  type="button"
                  aria-label={t("common.delete")}
                  onClick={() => setAttachmentKeys((prev) => prev.filter((k) => k !== key))}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {attachmentKeys.length < 3 && (
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFile(file);
                  e.target.value = "";
                }}
                className="text-[11px]"
              />
            )}
            {uploading && (
              <p className="text-[11px] text-gray-500">
                <T k="quote.uploading" />
              </p>
            )}
          </div>

          {outOfCredits && (
            <div id="out-of-credits" className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-center justify-between gap-2">
              <span>
                <T k="credits.outOfCredits" />
              </span>
              <Link href="/business/credits" className="font-bold underline shrink-0">
                <T k="credits.goToCredits" />
              </Link>
            </div>
          )}

          <div className="bg-gray-50 p-3 rounded-xl flex items-center justify-between text-xs gap-2">
            <span className="font-bold text-gray-600">
              <T k="quote.estimatedTotal" />
            </span>
            <span id="quote-live-total" className="text-sm font-bold text-primary">
              {formatMoney(liveTotal, lang)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="py-2.5 px-4 rounded-xl border border-gray-200 text-xs font-bold text-gray-600"
            >
              <T k="common.cancel" />
            </button>
            <button
              type="submit"
              id="submit-quote-btn"
              disabled={submitting || uploading}
              className="flex-1 py-2.5 bg-primary text-white text-xs font-bold rounded-xl disabled:opacity-50"
            >
              {submitting ? t("common.loading") : t("quote.submit")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-gray-700 block">{label}</label>
      {children}
    </div>
  );
}

function ChatPanel({
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
