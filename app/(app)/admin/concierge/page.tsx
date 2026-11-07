"use client";

import { useCallback, useEffect, useState } from "react";
import { T, useLang, useT } from "@/components/ui/T";
import { formatDate } from "@/lib/dates";
import { CurrencySelect } from "@/components/ui/CurrencySelect";
import { adminFetch } from "@/components/admin/AdminNav";
import { DEFAULT_CURRENCY } from "@/lib/currencies";

interface QueueItem {
  id: string;
  targetId: string;
  createdAt: string;
  request: { code: string; title: string; buyerBusiness: { name: string } } | null;
}
interface BusinessOption {
  id: string;
  name: string;
  area: string;
  isBuyer: boolean;
  isSupplier: boolean;
}
interface RequestOption {
  id: string;
  code: string;
  title: string;
  quantity: string;
  unit: string;
  buyerBusiness: { name: string };
}

const PAYMENT_TERMS = ["CASH_ON_DELIVERY", "ADVANCE", "CREDIT_7", "CREDIT_15", "CREDIT_30", "OTHER"];

type Notice = { ok: boolean; text: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p role="status" className={`rounded-lg p-2.5 text-[13px] ${notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
      {notice.text}
    </p>
  );
}

/** Enter requests and quotes taken by phone; both are flagged as concierge and log ops minutes (§7, §8.7). */
export default function AdminConciergePage() {
  const t = useT();
  const lang = useLang();
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [categories, setCategories] = useState<{ id: string; slug: string }[]>([]);
  const [openRequests, setOpenRequests] = useState<RequestOption[]>([]);

  const [buyerBusinessId, setBuyerBusinessId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [deliveryArea, setDeliveryArea] = useState("");
  const [requestMinutes, setRequestMinutes] = useState("15");
  const [requestNotice, setRequestNotice] = useState<Notice>(null);
  const [savingRequest, setSavingRequest] = useState(false);

  const [requestId, setRequestId] = useState("");
  const [supplierBusinessId, setSupplierBusinessId] = useState("");
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [unitPrice, setUnitPrice] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState("0");
  const [deliveryDays, setDeliveryDays] = useState("3");
  const [paymentTerm, setPaymentTerm] = useState("CASH_ON_DELIVERY");
  const [quoteMinutes, setQuoteMinutes] = useState("10");
  const [quoteNotice, setQuoteNotice] = useState<Notice>(null);
  const [savingQuote, setSavingQuote] = useState(false);

  const loadQueue = useCallback(async () => {
    setQueue(null);
    setQueueError(null);
    const res = await adminFetch("/api/admin/concierge/queue");
    if (res.ok) setQueue(res.data);
    else {
      setQueue([]);
      setQueueError(res.error);
    }
  }, []);

  const loadOpenRequests = useCallback(async () => {
    const res = await adminFetch("/api/admin/requests?status=OPEN");
    if (res.ok) setOpenRequests(res.data.requests);
  }, []);

  useEffect(() => {
    loadQueue();
    loadOpenRequests();
    adminFetch("/api/admin/businesses").then((res) => res.ok && setBusinesses(res.data.businesses));
    adminFetch("/api/categories").then((res) => res.ok && Array.isArray(res.data) && setCategories(res.data));
  }, [loadQueue, loadOpenRequests]);

  const createRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRequest(true);
    setRequestNotice(null);
    const res = await adminFetch("/api/admin/concierge/requests", {
      method: "POST",
      body: JSON.stringify({ buyerBusinessId, categoryId, title, quantity: Number(quantity), unit, deliveryArea, opsMinutesSpent: Number(requestMinutes) }),
    });
    setSavingRequest(false);
    if (!res.ok) return setRequestNotice({ ok: false, text: res.error });
    setRequestNotice({ ok: true, text: t("admin.concierge.requestSaved") });
    setTitle("");
    setQuantity("");
    loadQueue();
    loadOpenRequests();
  };

  const createQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    const request = openRequests.find((r) => r.id === requestId);
    setSavingQuote(true);
    setQuoteNotice(null);
    const res = await adminFetch("/api/admin/concierge/quotes", {
      method: "POST",
      body: JSON.stringify({
        requestId,
        supplierBusinessId,
        currency,
        unitPrice,
        quantity: request?.quantity,
        deliveryCharge,
        deliveryDays: Number(deliveryDays),
        paymentTerm,
        opsMinutesSpent: Number(quoteMinutes),
      }),
    });
    setSavingQuote(false);
    if (!res.ok) return setQuoteNotice({ ok: false, text: res.error });
    setQuoteNotice({ ok: true, text: t("admin.concierge.quoteSaved") });
    setUnitPrice("");
    loadQueue();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">
          <T k="admin.concierge.title" />
        </h1>
        <p className="page-subtitle">
          <T k="admin.concierge.subtitle" />
        </p>
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="section-title">
            <T k="admin.concierge.queueTitle" />
          </h2>
          <button type="button" onClick={loadQueue} className="btn btn-ghost btn-sm">
            <T k="admin.concierge.refresh" />
          </button>
        </div>
        {queue === null ? (
          <p className="px-4 py-4 text-sm text-slate-500">
            <T k="common.loading" />
          </p>
        ) : queueError ? (
          <p className="px-4 py-4 text-sm text-rose-700">{queueError}</p>
        ) : queue.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">
            <T k="admin.concierge.noPending" />
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {queue.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{item.request?.title ?? item.targetId}</p>
                  <p className="text-xs text-slate-500">
                    {item.request && `${item.request.code} · ${item.request.buyerBusiness.name} · `}
                    {formatDate(item.createdAt, lang)}
                  </p>
                </div>
                <button type="button" onClick={() => setRequestId(item.targetId)} className="btn btn-secondary btn-sm">
                  <T k="admin.concierge.provideQuote" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <form onSubmit={createRequest} className="card space-y-3 p-4">
          <div>
            <h2 className="section-title">
              <T k="admin.concierge.createRequest" />
            </h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              <T k="admin.concierge.createRequestDesc" />
            </p>
          </div>
          <div>
            <label htmlFor="concierge-buyer" className="label">
              <T k="admin.concierge.buyer" />
            </label>
            <select id="concierge-buyer" required value={buyerBusinessId} onChange={(e) => setBuyerBusinessId(e.target.value)} className="input">
              <option value="">{t("common.select")}</option>
              {businesses.filter((b) => b.isBuyer).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.area})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="concierge-category" className="label">
              <T k="listing.category" />
            </label>
            <select id="concierge-category" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
              <option value="">{t("common.select")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {t(`category.${c.slug}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="concierge-title" className="label">
              <T k="admin.concierge.titleField" />
            </label>
            <input id="concierge-title" required value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="concierge-quantity" className="label">
                <T k="admin.concierge.quantity" />
              </label>
              <input id="concierge-quantity" type="number" min="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="concierge-unit" className="label">
                <T k="admin.concierge.unit" />
              </label>
              <input id="concierge-unit" required value={unit} onChange={(e) => setUnit(e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label htmlFor="concierge-area" className="label">
              <T k="admin.concierge.deliveryArea" />
            </label>
            <input id="concierge-area" required value={deliveryArea} onChange={(e) => setDeliveryArea(e.target.value)} className="input" />
          </div>
          <div>
            <label htmlFor="concierge-request-minutes" className="label">
              <T k="admin.concierge.opsTime" />
            </label>
            <input id="concierge-request-minutes" type="number" min="1" required value={requestMinutes} onChange={(e) => setRequestMinutes(e.target.value)} className="input" />
          </div>
          <NoticeLine notice={requestNotice} />
          <button type="submit" disabled={savingRequest} className="btn btn-primary w-full">
            {savingRequest ? t("common.loading") : t("admin.concierge.submitRequest")}
          </button>
        </form>

        <form onSubmit={createQuote} className="card space-y-3 p-4">
          <div>
            <h2 className="section-title">
              <T k="admin.concierge.submitQuote" />
            </h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              <T k="admin.concierge.submitQuoteDesc" />
            </p>
          </div>
          <div>
            <label htmlFor="concierge-request" className="label">
              <T k="desk.col.request" />
            </label>
            <select id="concierge-request" required value={requestId} onChange={(e) => setRequestId(e.target.value)} className="input">
              <option value="">{t("common.select")}</option>
              {openRequests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code}: {r.title} ({r.buyerBusiness.name})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="concierge-supplier" className="label">
              <T k="admin.concierge.supplier" />
            </label>
            <select id="concierge-supplier" required value={supplierBusinessId} onChange={(e) => setSupplierBusinessId(e.target.value)} className="input">
              <option value="">{t("common.select")}</option>
              {businesses.filter((b) => b.isSupplier).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.area})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <CurrencySelect id="concierge-currency" value={currency} onChange={setCurrency} />
            <div>
              <label htmlFor="concierge-unit-price" className="label">
                <T k="quote.unitPrice" />
              </label>
              <input id="concierge-unit-price" type="number" step="0.01" min="0.01" required value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="concierge-delivery-charge" className="label">
                <T k="quote.deliveryCharge" />
              </label>
              <input id="concierge-delivery-charge" type="number" step="0.01" min="0" required value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="concierge-days" className="label">
                <T k="admin.concierge.deliveryDays" />
              </label>
              <input id="concierge-days" type="number" min="0" required value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="concierge-term" className="label">
                <T k="admin.concierge.paymentTerm" />
              </label>
              <select id="concierge-term" value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)} className="input">
                {PAYMENT_TERMS.map((pt) => (
                  <option key={pt} value={pt}>
                    {t(`payterm.${pt}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="concierge-quote-minutes" className="label">
              <T k="admin.concierge.opsTime" />
            </label>
            <input id="concierge-quote-minutes" type="number" min="1" required value={quoteMinutes} onChange={(e) => setQuoteMinutes(e.target.value)} className="input" />
          </div>
          <NoticeLine notice={quoteNotice} />
          <button type="submit" disabled={savingQuote} className="btn btn-primary w-full">
            {savingQuote ? t("common.loading") : t("admin.concierge.submitQuote")}
          </button>
        </form>
      </div>
    </div>
  );
}
