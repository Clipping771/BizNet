"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { T, useT, useLang } from "@/components/ui/T";
import { ORDER_STATUS_TONE, StatusChip } from "@/components/ui/ListStates";
import { formatMoney, formatNumber } from "@/lib/money";
import { formatDate } from "@/lib/dates";

type Role = "BUYER" | "SUPPLIER" | "ADMIN";

interface Snapshot {
  price: string;
  deliveryCharge?: string;
  total: string;
  currency?: string;
  quantity: string;
  unit: string;
  deliveryDays: number;
  paymentTerm: string;
  specDifferences: Record<string, any> | null;
  notes: string | null;
  requestTitle: string;
}

/** Which transitions each side may start from each status (mirrors lib/orders/transitions.ts). */
const ACTIONS: Record<string, Partial<Record<Role, string[]>>> = {
  CONFIRMED: { SUPPLIER: ["DISPATCHED", "CANCELLED"], BUYER: ["CANCELLED"] },
  DISPATCHED: { SUPPLIER: ["DELIVERED", "DISPUTED"], BUYER: ["DISPUTED"] },
  DELIVERED: { BUYER: ["COMPLETED", "DISPUTED"] },
  DISPUTED: { ADMIN: ["COMPLETED", "CANCELLED"] },
};
const NEEDS_REASON = ["CANCELLED", "DISPUTED"];

const ACTION_LABEL: Record<string, string> = {
  CONFIRMED: "order.confirmOrder",
  DISPATCHED: "order.markDispatched",
  DELIVERED: "order.markDelivered",
  COMPLETED: "order.markCompleted",
  CANCELLED: "order.cancel",
  DISPUTED: "order.dispute",
};

const STEPS = ["PENDING_CONFIRMATION", "CONFIRMED", "DISPATCHED", "DELIVERED", "COMPLETED"];

/** While awaiting confirmation, each side confirms once and either side may cancel. */
function actionsFor(order: any, role: Role | null): string[] {
  if (!role) return [];
  if (order.status === "PENDING_CONFIRMATION") {
    if (role === "SUPPLIER") return order.supplierConfirmedAt ? ["CANCELLED"] : ["CONFIRMED", "CANCELLED"];
    if (role === "BUYER") return order.buyerConfirmedAt ? ["CANCELLED"] : ["CONFIRMED", "CANCELLED"];
    return [];
  }
  return ACTIONS[order.status]?.[role] ?? [];
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const code = params.code as string;

  const [order, setOrder] = useState<any>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reason / admin-note sheet for cancel, dispute and dispute resolution
  const [pending, setPending] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [showReorder, setShowReorder] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${encodeURIComponent(code)}`);
    if (!res.ok) {
      setNotFound(true);
      return null;
    }
    const data = await res.json();
    setOrder(data.order);
    setRole(data.userRoleOnOrder);
    return data;
  }, [code]);

  useEffect(() => {
    (async () => {
      const data = await load();
      // After completion the feedback sheet opens on the buyer's next visit (§8.10)
      if (data?.userRoleOnOrder === "BUYER" && data.order.status === "COMPLETED" && !data.order.feedback) {
        setShowFeedback(true);
      }
      setLoading(false);
    })();
  }, [load]);

  const changeStatus = async (toStatus: string, note?: string) => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { toStatus };
      if (role === "ADMIN" && order.status === "DISPUTED") {
        body.disputeResolution = toStatus === "COMPLETED" ? "RESOLVED_COMPLETED" : "RESOLVED_CANCELLED";
        body.disputeNote = note;
      } else if (note) {
        body.reason = note;
      }
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t("common.tryAgain"));
        return;
      }
      setPending(null);
      setReason("");
      const data = await load();
      if (toStatus === "COMPLETED" && data?.userRoleOnOrder === "BUYER") setShowFeedback(true);
    } finally {
      setBusy(false);
    }
  };

  const onAction = (toStatus: string) => {
    const isResolution = role === "ADMIN" && order.status === "DISPUTED";
    if (NEEDS_REASON.includes(toStatus) || isResolution) {
      setPending(toStatus);
      setReason("");
    } else {
      changeStatus(toStatus);
    }
  };

  const reorder = async (mode: "PREVIOUS_SUPPLIER_ONLY" | "EVERYONE") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t("common.tryAgain"));
        return;
      }
      router.push(`/requests/${json.code}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-700 border-t-transparent" />
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="card mx-auto max-w-md space-y-3 p-6 text-center">
        <p id="order-not-found" className="text-sm text-slate-600">
          <T k="order.notFound" />
        </p>
        <Link href="/home" className="link text-sm">
          <T k="common.returnHome" />
        </Link>
      </div>
    );
  }

  const snap: Snapshot = order.snapshot;
  const other = role === "SUPPLIER" ? order.buyerBusiness : order.supplierBusiness;
  const actions = actionsFor(order, role);
  const specDiffs = Object.entries((snap.specDifferences || {}) as Record<string, any>).filter(
    ([key, value]) => key !== "_offered" && value !== "MATCH"
  );
  const offered: Record<string, string> = (snap.specDifferences as any)?._offered || {};
  const categorySlug: string = order.request?.category?.slug ?? "";
  const stepIndex = STEPS.indexOf(order.status);
  const history: any[] = order.statusHistory || [];
  const awaitingSupplier = order.status === "PENDING_CONFIRMATION" && role === "BUYER" && order.buyerConfirmedAt && !order.supplierConfirmedAt;

  return (
    <div className="page-wide space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">
            <T k="order.title" />
            {" · "}
            {formatDate(order.createdAt, lang)}
          </p>
          <h1 className="page-title mt-0.5">{order.code}</h1>
          <p className="mt-1 text-sm text-slate-600">{snap.requestTitle}</p>
        </div>
        <span id="order-status-badge" data-status={order.status}>
          <StatusChip k={`order.status.${order.status}`} tone={ORDER_STATUS_TONE[order.status] ?? "gray"} />
        </span>
      </div>

      {stepIndex >= 0 && (
        <ol aria-label={t("order.progress")} className="card flex items-center gap-1 overflow-x-auto px-4 py-3 scrollbar-none">
          {STEPS.map((step, i) => {
            const done = i < stepIndex || order.status === "COMPLETED";
            const current = i === stepIndex && !done;
            return (
              <li key={step} className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    done ? "bg-primary-700 text-white" : current ? "bg-amber-400 text-primary-950" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : formatNumber(i + 1, lang)}
                </span>
                <span className={`hidden truncate text-xs md:block ${current || done ? "font-medium text-slate-900" : "text-slate-500"}`}>
                  <T k={`order.status.${step}`} />
                </span>
                {i < STEPS.length - 1 && <span aria-hidden="true" className={`h-px min-w-3 flex-1 ${done ? "bg-primary-700" : "bg-slate-200"}`} />}
              </li>
            );
          })}
        </ol>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {/* Agreed terms, from the order snapshot (original language) */}
          <section className="card">
            <h2 className="card-header section-title">
              <T k="order.terms" />
            </h2>
            <dl className="divide-y divide-slate-100 text-sm">
              <Line label={t("rfq.quantity")} value={`${formatNumber(snap.quantity, lang)} ${snap.unit}`} />
              <Line label={t("quote.unitPriceShort")} value={formatMoney(snap.price, lang, snap.currency)} />
              {snap.deliveryCharge !== undefined && (
                <Line label={t("quote.deliveryCharge")} value={formatMoney(snap.deliveryCharge, lang, snap.currency)} />
              )}
              <Line label={t("quote.deliveryDays")} value={t(snap.deliveryDays === 1 ? "unit.day.one" : "unit.day.other", undefined, { n: formatNumber(snap.deliveryDays, lang) })} />
              {order.expectedDeliveryAt && <Line label={t("order.expectedDelivery")} value={formatDate(order.expectedDeliveryAt, lang)} />}
              <Line label={t("quote.totalPrice")} value={formatMoney(snap.total, lang, snap.currency)} strong />
            </dl>
            {specDiffs.length > 0 && (
              <div className="border-t border-slate-100 bg-amber-50/60 px-4 py-3">
                <p className="text-xs font-semibold text-amber-800">
                  <T k="order.specDifferences" />
                </p>
                <dl className="mt-1 space-y-1 text-xs">
                  {specDiffs.map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-3">
                      <dt className="text-slate-600">{t(`attr.${categorySlug}.${key}.label`)}</dt>
                      <dd className="font-medium text-slate-900">{value === "DIFFERENT" ? t("cmp.specOffered", undefined, { value: offered[key] ?? "" }) : t("quote.notStated")}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              {t("order.paymentOutside", undefined, { term: t(`payterm.${snap.paymentTerm}`) })}
            </p>
          </section>

          {history.length > 0 && (
            <section className="card">
              <h2 className="card-header section-title">
                <T k="order.timeline" />
              </h2>
              <ol className="ms-4 space-y-4 border-s-2 border-slate-100 py-4 pe-4 ps-4">
                {history.map((h: any) => (
                  <li key={h.id} className="text-sm">
                    <p className="font-medium text-slate-900">
                      <T k={`order.status.${h.toStatus}`} />
                    </p>
                    <p className="text-xs text-slate-500">{formatDate(h.createdAt, lang, { hour: "2-digit", minute: "2-digit" })}</p>
                    {h.reason && <p className="mt-1 text-slate-600">{h.reason}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="card space-y-2 p-4">
            <h2 className="section-title">
              <T k="order.nextStep" />
            </h2>
            {error && (
              <div id="order-error" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {error}
              </div>
            )}
            {awaitingSupplier && (
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                <T k="order.awaitingSupplier" />
              </p>
            )}
            {actions.map((toStatus) => {
              const isResolution = role === "ADMIN" && order.status === "DISPUTED";
              const label = isResolution ? (toStatus === "COMPLETED" ? "order.resolveComplete" : "order.resolveCancel") : ACTION_LABEL[toStatus];
              const danger = toStatus === "CANCELLED" || toStatus === "DISPUTED";
              return (
                <button
                  key={toStatus}
                  type="button"
                  id={`order-action-${toStatus}`}
                  disabled={busy}
                  onClick={() => onAction(toStatus)}
                  className={`btn w-full ${danger ? "btn-secondary text-rose-700" : "btn-primary"}`}
                >
                  <T k={label} />
                </button>
              );
            })}

            {role === "BUYER" && order.status === "COMPLETED" && (
              <>
                {!order.feedback && !feedbackSaved && (
                  <button type="button" id="open-feedback-btn" onClick={() => setShowFeedback(true)} className="btn btn-secondary w-full">
                    <T k="order.giveFeedback" />
                  </button>
                )}
                {(order.feedback || feedbackSaved) && (
                  <p id="feedback-saved" className="text-xs text-emerald-700">
                    <T k="order.feedbackSaved" />
                  </p>
                )}
                <button type="button" id="order-again-btn" onClick={() => setShowReorder(true)} className="btn btn-primary w-full">
                  <T k="order.orderAgain" />
                </button>
              </>
            )}

            {role === "BUYER" && order.status === "CANCELLED" && (
              <>
                <p className="text-xs text-slate-600">
                  <T k="order.cancelledNotice" />
                </p>
                <Link href={`/requests/new?repeatOf=${encodeURIComponent(order.request.code)}`} id="new-request-from-order" className="btn btn-primary w-full">
                  <T k="order.newFromThis" />
                </Link>
              </>
            )}

            {actions.length === 0 && !awaitingSupplier && !(role === "BUYER" && (order.status === "COMPLETED" || order.status === "CANCELLED")) && (
              <p className="text-sm text-slate-500">
                <T k="order.noActions" />
              </p>
            )}
          </section>

          {/* The other side of the deal; contact is revealed once an order exists (§8.9) */}
          <section className="card space-y-1 p-4 text-sm">
            <p className="eyebrow">{role === "SUPPLIER" ? t("order.buyer") : t("order.supplier")}</p>
            <p id="order-counterparty" className="pt-1 font-semibold text-slate-900">
              {other?.name}
            </p>
            {other?.phonePublic && (
              <p className="text-xs text-slate-600">
                {t("msg.phone")}
                {": "}
                {other.phonePublic}
              </p>
            )}
            {other?.whatsapp && (
              <p className="text-xs text-slate-600">
                {t("msg.whatsapp")}
                {": "}
                {other.whatsapp}
              </p>
            )}
            {other?.addressLine && (
              <p className="text-xs text-slate-600">
                {t("msg.address")}
                {": "}
                {other.addressLine}
              </p>
            )}
            {order.request?.code && (
              <Link href={`/requests/${order.request.code}`} className="link inline-block pt-1 text-xs">
                <T k="order.viewOriginalRequest" />
              </Link>
            )}
          </section>
        </aside>
      </div>

      {pending && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-primary-950/50 p-4 sm:items-center">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-pop">
            <h3 className="section-title">
              <T k={role === "ADMIN" && order.status === "DISPUTED" ? "order.adminNote" : pending === "CANCELLED" ? "order.cancelReasonPrompt" : "order.disputePrompt"} />
            </h3>
            <textarea
              id="order-reason-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("order.reasonLabel")}
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm placeholder:text-slate-400 hover:border-slate-400"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setPending(null)} className="btn btn-secondary flex-1">
                <T k={pending === "CANCELLED" ? "order.keepOrder" : "common.cancel"} />
              </button>
              <button
                type="button"
                id="order-reason-submit"
                disabled={!reason.trim() || busy}
                onClick={() => changeStatus(pending, reason.trim())}
                className="btn flex-1 bg-rose-600 text-white hover:bg-rose-700"
              >
                <T k={pending === "CANCELLED" ? "order.confirmCancel" : pending === "DISPUTED" ? "order.submitDispute" : "common.confirm"} />
              </button>
            </div>
          </div>
        </div>
      )}

      {showFeedback && (
        <FeedbackSheet
          orderId={order.id}
          onClose={() => setShowFeedback(false)}
          onSaved={async () => {
            setShowFeedback(false);
            setFeedbackSaved(true);
            await load();
          }}
        />
      )}

      {showReorder && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-primary-950/50 p-4 sm:items-center">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-pop">
            <h3 className="section-title">
              <T k="order.orderAgain" />
            </h3>
            <p className="text-xs text-slate-500">
              <T k="reorder.chooseMethod" />
            </p>
            <button
              type="button"
              id="reorder-previous-supplier"
              disabled={busy}
              onClick={() => reorder("PREVIOUS_SUPPLIER_ONLY")}
              className="w-full rounded-lg border border-primary-300 p-3 text-start transition-colors hover:bg-primary-50 disabled:opacity-50"
            >
              <span className="block text-sm font-semibold text-slate-900">{t("order.onlyFromSupplier", undefined, { supplier: order.supplierBusiness?.name ?? "" })}</span>
              <span className="block text-xs text-slate-500">
                <T k="reorder.directSupplierDesc" />
              </span>
            </button>
            <button
              type="button"
              id="reorder-everyone"
              disabled={busy}
              onClick={() => reorder("EVERYONE")}
              className="w-full rounded-lg border border-slate-200 p-3 text-start transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <span className="block text-sm font-semibold text-slate-900">
                <T k="order.fromEveryone" />
              </span>
              <span className="block text-xs text-slate-500">
                <T k="reorder.everyoneDesc" />
              </span>
            </button>
            <button type="button" onClick={() => setShowReorder(false)} className="btn btn-ghost w-full">
              <T k="common.cancel" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 px-4 py-2.5 ${strong ? "bg-slate-50" : ""}`}>
      <dt className="text-slate-500">{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-base font-semibold text-slate-900" : "font-medium text-slate-800"}`}>{value}</dd>
    </div>
  );
}

/** Two-tap private reliability feedback; every question is optional (§8.10). */
function FeedbackSheet({ orderId, onClose, onSaved }: { orderId: string; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [onTime, setOnTime] = useState<boolean | null>(null);
  const [quantityCorrect, setQuantityCorrect] = useState<boolean | null>(null);
  const [matchedSpec, setMatchedSpec] = useState<boolean | null>(null);
  const [hadIssue, setHadIssue] = useState(false);
  const [issueResolved, setIssueResolved] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onTime,
          quantityCorrect,
          matchedSpec,
          hadIssue,
          issueResolved: hadIssue ? issueResolved : null,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        setError((await res.json()).error || t("common.tryAgain"));
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-primary-950/50 p-4 sm:items-center">
      <div id="feedback-sheet" className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-pop">
        <div>
          <h3 className="section-title">
            <T k="feedback.title" />
          </h3>
          <p className="text-xs text-slate-500">
            <T k="feedback.subtitle" />
          </p>
        </div>
        <YesNo id="fb-on-time" label={t("feedback.onTime")} value={onTime} onChange={setOnTime} />
        <YesNo id="fb-quantity" label={t("feedback.quantityCorrect")} value={quantityCorrect} onChange={setQuantityCorrect} />
        <YesNo id="fb-spec" label={t("feedback.matchedSpec")} value={matchedSpec} onChange={setMatchedSpec} />
        <YesNo id="fb-issue" label={t("feedback.hadIssue")} value={hadIssue} onChange={(v) => setHadIssue(!!v)} />
        {hadIssue && <YesNo id="fb-resolved" label={t("feedback.issueResolved")} value={issueResolved} onChange={setIssueResolved} />}
        <textarea
          id="fb-note"
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("feedback.note")}
          className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm placeholder:text-slate-400 hover:border-slate-400"
        />
        {error && <p className="text-xs text-rose-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
            <T k="feedback.skip" />
          </button>
          <button type="button" id="fb-submit" disabled={saving} onClick={save} className="btn btn-primary flex-1">
            <T k="feedback.submit" />
          </button>
        </div>
      </div>
    </div>
  );
}

function YesNo({ id, label, value, onChange }: { id: string; label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-slate-700">{label}</span>
      <div className="flex gap-1.5">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            id={`${id}-${v ? "yes" : "no"}`}
            onClick={() => onChange(value === v ? null : v)}
            className={`btn btn-sm ${value === v ? "bg-primary-700 text-white" : "btn-secondary"}`}
          >
            <T k={v ? "common.yes" : "common.no"} />
          </button>
        ))}
      </div>
    </div>
  );
}
