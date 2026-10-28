"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { T, useT, useLang } from "@/components/ui/T";
import { formatMoney, formatNumber } from "@/lib/money";
import { formatDate } from "@/lib/dates";

type Role = "BUYER" | "SUPPLIER" | "ADMIN";

interface Snapshot {
  price: string;
  deliveryCharge?: string;
  total: string;
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
  DISPATCHED: "order.markDispatched",
  DELIVERED: "order.markDelivered",
  COMPLETED: "order.markCompleted",
  CANCELLED: "order.cancel",
  DISPUTED: "order.dispute",
};

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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="mx-auto max-w-md p-6 text-center space-y-3">
        <p id="order-not-found" className="text-sm text-gray-600">
          <T k="order.notFound" />
        </p>
        <Link href="/home" className="text-emerald-700 underline text-sm">
          <T k="common.returnHome" />
        </Link>
      </div>
    );
  }

  const snap: Snapshot = order.snapshot;
  const other = role === "SUPPLIER" ? order.buyerBusiness : order.supplierBusiness;
  const actions = (role && ACTIONS[order.status]?.[role]) || [];
  const specDiffs = Object.entries((snap.specDifferences || {}) as Record<string, any>).filter(
    ([key, value]) => key !== "_offered" && value !== "MATCH"
  );
  const offered: Record<string, string> = (snap.specDifferences as any)?._offered || {};
  const categorySlug: string = order.request?.category?.slug ?? "";

  return (
    <div className="mx-auto max-w-md p-4 pb-20 space-y-4">
      <div className="flex items-start justify-between border-b pb-3">
        <div>
          <span className="text-xs text-gray-500">
            <T k="order.title" />
          </span>
          <h1 className="text-lg font-bold text-gray-900">{order.code}</h1>
          <p className="text-xs text-gray-500">{formatDate(order.createdAt, lang)}</p>
        </div>
        <span
          id="order-status-badge"
          data-status={order.status}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            order.status === "COMPLETED"
              ? "bg-emerald-100 text-emerald-800"
              : order.status === "DISPUTED"
              ? "bg-amber-100 text-amber-800"
              : order.status === "CANCELLED"
              ? "bg-rose-100 text-rose-800"
              : "bg-blue-100 text-blue-800"
          }`}
        >
          <T k={`order.status.${order.status}`} />
        </span>
      </div>

      {/* Agreed terms, from the order snapshot (original language) */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-2 text-sm">
        <h2 className="font-semibold text-gray-900">{snap.requestTitle}</h2>
        <Line label={t("rfq.quantity")} value={`${formatNumber(snap.quantity, lang)} ${snap.unit}`} />
        <Line label={t("quote.unitPriceShort")} value={formatMoney(snap.price, lang)} />
        {snap.deliveryCharge !== undefined && (
          <Line label={t("quote.deliveryCharge")} value={formatMoney(snap.deliveryCharge, lang)} />
        )}
        <Line label={t("quote.totalPrice")} value={formatMoney(snap.total, lang)} strong />
        <Line label={t("quote.deliveryDays")} value={t(snap.deliveryDays === 1 ? "unit.day.one" : "unit.day.other", undefined, { n: formatNumber(snap.deliveryDays, lang) })} />
        {order.expectedDeliveryAt && (
          <Line label={t("order.expectedDelivery")} value={formatDate(order.expectedDeliveryAt, lang)} />
        )}
        {specDiffs.length > 0 && (
          <div className="pt-1">
            <p className="text-xs font-bold text-amber-800">
              <T k="order.specDifferences" />
            </p>
            {specDiffs.map(([key, value]) => (
              <Line
                key={key}
                label={t(`attr.${categorySlug}.${key}.label`)}
                value={value === "DIFFERENT" ? t("cmp.specOffered", undefined, { value: offered[key] ?? "" }) : t("quote.notStated")}
              />
            ))}
          </div>
        )}
        <p className="text-[11px] text-gray-500 pt-1">
          {t("order.paymentOutside", undefined, { term: t(`payterm.${snap.paymentTerm}`) })}
        </p>
      </div>

      {/* The other side of the deal; contact is revealed once an order exists (§8.9) */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm text-sm space-y-1">
        <p className="text-xs text-gray-400">{role === "SUPPLIER" ? t("order.buyer") : t("order.supplier")}</p>
        <p id="order-counterparty" className="font-semibold text-gray-900">
          {other?.name}
        </p>
        {other?.phonePublic && (
          <p className="text-xs">
            {t("msg.phone")}
            {": "}
            {other.phonePublic}
          </p>
        )}
        {other?.whatsapp && (
          <p className="text-xs">
            {t("msg.whatsapp")}
            {": "}
            {other.whatsapp}
          </p>
        )}
        {other?.addressLine && (
          <p className="text-xs">
            {t("msg.address")}
            {": "}
            {other.addressLine}
          </p>
        )}
        {order.request?.code && (
          <Link href={`/requests/${order.request.code}`} className="text-xs text-emerald-700 underline">
            <T k="order.viewOriginalRequest" />
          </Link>
        )}
      </div>

      {error && (
        <div id="order-error" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </div>
      )}

      {actions.length > 0 && (
        <div className="space-y-2">
          {actions.map((toStatus) => {
            const isResolution = role === "ADMIN" && order.status === "DISPUTED";
            const label = isResolution
              ? toStatus === "COMPLETED"
                ? "order.resolveComplete"
                : "order.resolveCancel"
              : ACTION_LABEL[toStatus];
            const danger = toStatus === "CANCELLED" || toStatus === "DISPUTED";
            return (
              <button
                key={toStatus}
                type="button"
                id={`order-action-${toStatus}`}
                disabled={busy}
                onClick={() => onAction(toStatus)}
                className={`w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-50 ${
                  danger ? "border border-rose-300 text-rose-700 bg-white" : "bg-emerald-600 text-white"
                }`}
              >
                <T k={label} />
              </button>
            );
          })}
        </div>
      )}

      {role === "BUYER" && order.status === "COMPLETED" && (
        <div className="space-y-2">
          {!order.feedback && !feedbackSaved && (
            <button
              type="button"
              id="open-feedback-btn"
              onClick={() => setShowFeedback(true)}
              className="w-full rounded-xl border border-emerald-300 py-3 text-sm font-semibold text-emerald-700"
            >
              <T k="order.giveFeedback" />
            </button>
          )}
          {(order.feedback || feedbackSaved) && (
            <p id="feedback-saved" className="text-xs text-emerald-700 text-center">
              <T k="order.feedbackSaved" />
            </p>
          )}
          <button
            type="button"
            id="order-again-btn"
            onClick={() => setShowReorder(true)}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white"
          >
            <T k="order.orderAgain" />
          </button>
        </div>
      )}

      {role === "BUYER" && order.status === "CANCELLED" && (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">
            <T k="order.cancelledNotice" />
          </p>
          <Link
            href={`/requests/new?repeatOf=${encodeURIComponent(order.request.code)}`}
            id="new-request-from-order"
            className="block w-full rounded-xl bg-emerald-600 py-3 text-center text-sm font-semibold text-white"
          >
            <T k="order.newFromThis" />
          </Link>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          <T k="order.timeline" />
        </h3>
        <ol className="space-y-3 border-s-2 border-gray-100 ps-4">
          {(order.statusHistory || []).map((h: any) => (
            <li key={h.id} className="text-xs">
              <p className="font-semibold text-gray-800">
                <T k={`order.status.${h.toStatus}`} />
              </p>
              <p className="text-gray-400">{formatDate(h.createdAt, lang, { hour: "2-digit", minute: "2-digit" })}</p>
              {h.reason && <p className="text-gray-600">{h.reason}</p>}
            </li>
          ))}
        </ol>
      </div>

      {pending && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900">
              <T
                k={
                  role === "ADMIN" && order.status === "DISPUTED"
                    ? "order.adminNote"
                    : pending === "CANCELLED"
                    ? "order.cancelReasonPrompt"
                    : "order.disputePrompt"
                }
              />
            </h3>
            <textarea
              id="order-reason-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("order.reasonLabel")}
              className="w-full rounded-xl border border-gray-200 p-3 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700"
              >
                <T k={pending === "CANCELLED" ? "order.keepOrder" : "common.cancel"} />
              </button>
              <button
                type="button"
                id="order-reason-submit"
                disabled={!reason.trim() || busy}
                onClick={() => changeStatus(pending, reason.trim())}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
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
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900">
              <T k="order.orderAgain" />
            </h3>
            <p className="text-xs text-gray-500">
              <T k="reorder.chooseMethod" />
            </p>
            <button
              type="button"
              id="reorder-previous-supplier"
              disabled={busy}
              onClick={() => reorder("PREVIOUS_SUPPLIER_ONLY")}
              className="w-full rounded-xl border border-emerald-300 p-3 text-start disabled:opacity-50"
            >
              <span className="block text-sm font-semibold text-gray-900">
                {t("order.onlyFromSupplier", undefined, { supplier: order.supplierBusiness?.name ?? "" })}
              </span>
              <span className="block text-xs text-gray-500">
                <T k="reorder.directSupplierDesc" />
              </span>
            </button>
            <button
              type="button"
              id="reorder-everyone"
              disabled={busy}
              onClick={() => reorder("EVERYONE")}
              className="w-full rounded-xl border border-gray-200 p-3 text-start disabled:opacity-50"
            >
              <span className="block text-sm font-semibold text-gray-900">
                <T k="order.fromEveryone" />
              </span>
              <span className="block text-xs text-gray-500">
                <T k="reorder.everyoneDesc" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowReorder(false)}
              className="w-full py-2 text-sm text-gray-500"
            >
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
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={strong ? "font-bold text-emerald-700" : "font-semibold text-gray-800"}>{value}</span>
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
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div id="feedback-sheet" className="w-full max-w-sm rounded-2xl bg-white p-5 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">
            <T k="feedback.title" />
          </h3>
          <p className="text-xs text-gray-500">
            <T k="feedback.subtitle" />
          </p>
        </div>
        <YesNo id="fb-on-time" label={t("feedback.onTime")} value={onTime} onChange={setOnTime} />
        <YesNo id="fb-quantity" label={t("feedback.quantityCorrect")} value={quantityCorrect} onChange={setQuantityCorrect} />
        <YesNo id="fb-spec" label={t("feedback.matchedSpec")} value={matchedSpec} onChange={setMatchedSpec} />
        <YesNo id="fb-issue" label={t("feedback.hadIssue")} value={hadIssue} onChange={(v) => setHadIssue(!!v)} />
        {hadIssue && (
          <YesNo id="fb-resolved" label={t("feedback.issueResolved")} value={issueResolved} onChange={setIssueResolved} />
        )}
        <textarea
          id="fb-note"
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("feedback.note")}
          className="w-full rounded-xl border border-gray-200 p-2.5 text-xs"
        />
        {error && <p className="text-xs text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600">
            <T k="feedback.skip" />
          </button>
          <button
            type="button"
            id="fb-submit"
            disabled={saving}
            onClick={save}
            className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <T k="feedback.submit" />
          </button>
        </div>
      </div>
    </div>
  );
}

function YesNo({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-gray-700">{label}</span>
      <div className="flex gap-1.5">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            id={`${id}-${v ? "yes" : "no"}`}
            onClick={() => onChange(value === v ? null : v)}
            className={`rounded-full px-3 py-1 border ${
              value === v ? "bg-emerald-600 text-white border-emerald-600" : "bg-gray-50 text-gray-700 border-gray-200"
            }`}
          >
            <T k={v ? "common.yes" : "common.no"} />
          </button>
        ))}
      </div>
    </div>
  );
}
