"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { T, useT } from "@/components/ui/T";

interface QueueItem {
  id: string;
  targetId: string;
  reason: string;
  details?: string | null;
  status: string;
  createdAt: string;
}

export default function AdminConciergePage() {
  const t = useT();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Concierge Request Form state
  const [buyerBusinessId, setBuyerBusinessId] = useState("");
  const [reqCategoryId, setReqCategoryId] = useState("");
  const [reqTitle, setReqTitle] = useState("");
  const [reqQuantity, setReqQuantity] = useState(100);
  const [reqUnit, setReqUnit] = useState("pieces");
  const [reqDeliveryArea, setReqDeliveryArea] = useState("Dhanmondi, Dhaka");
  const [reqNeededDays, setReqNeededDays] = useState(7);
  const [reqOpsMinutes, setReqOpsMinutes] = useState(15);
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);

  // Concierge Quote Form state
  const [quoteRequestId, setQuoteRequestId] = useState("");
  const [quoteSupplierBusinessId, setQuoteSupplierBusinessId] = useState("");
  const [quoteUnitPrice, setQuoteUnitPrice] = useState("10.00");
  const [quoteDeliveryCharge, setQuoteDeliveryCharge] = useState("150.00");
  const [quoteDeliveryDays, setQuoteDeliveryDays] = useState(3);
  const [quotePaymentTerm, setQuotePaymentTerm] = useState("CASH_ON_DELIVERY");
  const [quoteOpsMinutes, setQuoteOpsMinutes] = useState(10);
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  async function loadQueue() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/concierge/queue");
      if (!res.ok) {
        throw new Error("Failed to load concierge queue");
      }
      const data = await res.json();
      setQueue(data);
    } catch (e: any) {
      setError(e.message || "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateConciergeRequest(e: React.FormEvent) {
    e.preventDefault();
    try {
      setIsSubmittingReq(true);
      const neededBy = new Date();
      neededBy.setDate(neededBy.getDate() + reqNeededDays);

      const res = await fetch("/api/admin/concierge/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerBusinessId,
          categoryId: reqCategoryId,
          title: reqTitle,
          quantity: reqQuantity,
          unit: reqUnit,
          neededBy: neededBy.toISOString(),
          deliveryArea: reqDeliveryArea,
          opsTimeMinutes: reqOpsMinutes,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create concierge request");
        return;
      }

      alert("Concierge request created successfully!");
      setReqTitle("");
      loadQueue();
    } catch (e: any) {
      alert(e.message || "Error creating request");
    } finally {
      setIsSubmittingReq(false);
    }
  }

  async function handleCreateConciergeQuote(e: React.FormEvent) {
    e.preventDefault();
    try {
      setIsSubmittingQuote(true);
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 7);

      const res = await fetch("/api/admin/concierge/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: quoteRequestId,
          supplierBusinessId: quoteSupplierBusinessId,
          unitPrice: quoteUnitPrice,
          deliveryCharge: quoteDeliveryCharge,
          deliveryDays: quoteDeliveryDays,
          paymentTerm: quotePaymentTerm,
          validUntil: validUntil.toISOString(),
          opsTimeMinutes: quoteOpsMinutes,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to submit concierge quote");
        return;
      }

      alert("Concierge quote submitted successfully!");
      loadQueue();
    } catch (e: any) {
      alert(e.message || "Error submitting quote");
    } finally {
      setIsSubmittingQuote(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900"><T k="admin.concierge.title" /></h1>
        <p className="text-sm text-gray-500">
          <T k="admin.concierge.subtitle" />
        </p>
      </div>

      {/* 0-Match Requests Queue */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            <T k="admin.concierge.queueTitle" /> ({queue.length})
          </h2>
          <button
            onClick={loadQueue}
            className="text-xs text-emerald-700 hover:underline"
          >
            <T k="admin.concierge.refresh" />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500"><T k="admin.concierge.loading" /></p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : queue.length === 0 ? (
          <p className="text-sm text-gray-500"><T k="admin.concierge.noPending" /></p>
        ) : (
          <div className="divide-y text-sm">
            {queue.map((item) => (
              <div key={item.id} className="py-3 flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-900"><T k="admin.concierge.requestId" />: {item.targetId}</span>
                  <p className="text-xs text-gray-500">{item.reason}</p>
                  <p className="text-xs text-gray-400">
                    <T k="admin.concierge.flagged" />: {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setQuoteRequestId(item.targetId);
                    }}
                    className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <T k="admin.concierge.provideQuote" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Create Concierge Request on Behalf of Buyer */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-2">
            <T k="admin.concierge.createRequest" />
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            <T k="admin.concierge.createRequestDesc" />
          </p>

          <form onSubmit={handleCreateConciergeRequest} className="space-y-3">
            <div>
              <label className="text-xs text-gray-600 block"><T k="admin.concierge.buyerBusinessId" /></label>
              <input
                type="text"
                required
                value={buyerBusinessId}
                onChange={(e) => setBuyerBusinessId(e.target.value)}
                placeholder="cuid..."
                className="w-full rounded border p-2 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block"><T k="admin.concierge.categoryId" /></label>
              <input
                type="text"
                required
                value={reqCategoryId}
                onChange={(e) => setReqCategoryId(e.target.value)}
                placeholder="containers / food_boxes / cups..."
                className="w-full rounded border p-2 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block"><T k="admin.concierge.titleField" /></label>
              <input
                type="text"
                required
                value={reqTitle}
                onChange={(e) => setReqTitle(e.target.value)}
                placeholder="500ml Round PP Food Containers"
                className="w-full rounded border p-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 block"><T k="admin.concierge.quantity" /></label>
                <input
                  type="number"
                  min="1"
                  required
                  value={reqQuantity}
                  onChange={(e) => setReqQuantity(Number(e.target.value))}
                  className="w-full rounded border p-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block"><T k="admin.concierge.unit" /></label>
                <input
                  type="text"
                  required
                  value={reqUnit}
                  onChange={(e) => setReqUnit(e.target.value)}
                  className="w-full rounded border p-2 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600 block"><T k="admin.concierge.deliveryArea" /></label>
              <input
                type="text"
                required
                value={reqDeliveryArea}
                onChange={(e) => setReqDeliveryArea(e.target.value)}
                className="w-full rounded border p-2 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block"><T k="admin.concierge.opsTime" /></label>
              <input
                type="number"
                min="1"
                required
                value={reqOpsMinutes}
                onChange={(e) => setReqOpsMinutes(Number(e.target.value))}
                className="w-full rounded border p-2 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmittingReq}
              className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmittingReq ? t("common.loading") : t("admin.concierge.submitRequest")}
            </button>
          </form>
        </div>

        {/* Create Concierge Quote on Behalf of Supplier */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-2">
            <T k="admin.concierge.submitQuote" />
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            <T k="admin.concierge.submitQuoteDesc" />
          </p>

          <form onSubmit={handleCreateConciergeQuote} className="space-y-3">
            <div>
              <label className="text-xs text-gray-600 block"><T k="admin.concierge.requestId" /></label>
              <input
                type="text"
                required
                value={quoteRequestId}
                onChange={(e) => setQuoteRequestId(e.target.value)}
                placeholder="cuid..."
                className="w-full rounded border p-2 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block"><T k="admin.concierge.supplierBusinessId" /></label>
              <input
                type="text"
                required
                value={quoteSupplierBusinessId}
                onChange={(e) => setQuoteSupplierBusinessId(e.target.value)}
                placeholder="cuid..."
                className="w-full rounded border p-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 block"><T k="admin.concierge.unitPrice" /></label>
                <input
                  type="text"
                  required
                  value={quoteUnitPrice}
                  onChange={(e) => setQuoteUnitPrice(e.target.value)}
                  className="w-full rounded border p-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block"><T k="admin.concierge.deliveryCharge" /></label>
                <input
                  type="text"
                  required
                  value={quoteDeliveryCharge}
                  onChange={(e) => setQuoteDeliveryCharge(e.target.value)}
                  className="w-full rounded border p-2 text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 block"><T k="admin.concierge.deliveryDays" /></label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quoteDeliveryDays}
                  onChange={(e) => setQuoteDeliveryDays(Number(e.target.value))}
                  className="w-full rounded border p-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block"><T k="admin.concierge.paymentTerm" /></label>
                <select
                  value={quotePaymentTerm}
                  onChange={(e) => setQuotePaymentTerm(e.target.value)}
                  className="w-full rounded border p-2 text-xs"
                >
                  {["CASH_ON_DELIVERY", "ADVANCE", "CREDIT_7", "CREDIT_15", "CREDIT_30", "OTHER"].map((pt) => (
                    <option key={pt} value={pt}>
                      {t(`payterm.${pt}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600 block"><T k="admin.concierge.opsTime" /></label>
              <input
                type="number"
                min="1"
                required
                value={quoteOpsMinutes}
                onChange={(e) => setQuoteOpsMinutes(Number(e.target.value))}
                className="w-full rounded border p-2 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmittingQuote}
              className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmittingQuote ? t("common.loading") : t("admin.concierge.submitQuote")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
