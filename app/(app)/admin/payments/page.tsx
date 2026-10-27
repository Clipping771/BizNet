"use client";

import { useCallback, useEffect, useState } from "react";
import { T, useLang, useT } from "@/components/ui/T";
import { adminFetch } from "@/components/admin/AdminNav";
import { formatMoney } from "@/lib/money";

/** Manual bKash/Nagad payment queue (F23): verify the transaction, then approve to add credits. */
export default function AdminPaymentsPage() {
  const t = useT();
  const lang = useLang();
  const [payments, setPayments] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetch("/api/admin/payments");
    if (res.ok) setPayments(res.data.payments);
    else setMessage(res.status === 403 ? t("admin.forbidden") : res.error);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (id: string, approve: boolean) => {
    const res = await adminFetch(`/api/admin/payments/${id}`, { method: "POST", body: JSON.stringify({ approve }) });
    setMessage(res.ok ? t("admin.saved") : res.error);
    await load();
  };

  return (
    <div className="space-y-3">
      {message && <p className="text-sm text-gray-700">{message}</p>}
      {payments.length === 0 && (
        <p className="text-xs text-gray-400">
          <T k="admin.payments.none" />
        </p>
      )}
      {payments.map((p) => (
        <div key={p.id} data-payment={p.trxId} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 text-xs">
          <p className="font-semibold text-gray-900">
            {t("admin.payments.line", undefined, {
              business: p.business.name,
              method: t(`method.${p.method}`),
              amount: formatMoney(p.amount, lang),
              credits: p.creditsRequested,
            })}
          </p>
          <p className="font-mono text-gray-500">{t("admin.payments.detail", undefined, { trx: p.trxId, sender: p.senderNumber })}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => review(p.id, true)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold">
              <T k="admin.payments.approve" />
            </button>
            <button type="button" onClick={() => review(p.id, false)} className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 font-semibold">
              <T k="admin.payments.reject" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
