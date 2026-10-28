"use client";

import { useCallback, useEffect, useState } from "react";
import { T, useLang, useT } from "@/components/ui/T";
import { formatMoney, formatNumber } from "@/lib/money";
import { formatDate } from "@/lib/dates";

/** Supplier lead credits (F23, READY): balance, history, and manual bKash/Nagad top-up. */
export default function CreditsPage() {
  const t = useT();
  const lang = useLang();
  const [data, setData] = useState<any>(null);
  const [method, setMethod] = useState("BKASH");
  const [packIndex, setPackIndex] = useState(0);
  const [trxId, setTrxId] = useState("");
  const [sender, setSender] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/credits");
    const json = await res.json();
    if (res.ok) setData(json);
    else setError(json.error || t("common.tryAgain"));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const res = await fetch("/api/credits/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, packIndex, trxId, senderNumber: sender }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || t("common.tryAgain"));
      return;
    }
    setMessage(t("credits.submitted"));
    setTrxId("");
    await load();
  };

  if (!data) {
    return error ? <p className="text-sm text-red-600">{error}</p> : null;
  }

  const receiver = method === "BKASH" ? data.receivers?.bkash : data.receivers?.nagad;

  return (
    <div className="page space-y-4">
      <h1 className="page-title">
        <T k="credits.title" />
      </h1>

      {!data.enabled ? (
        <p id="credits-not-active" className="card p-4 text-sm text-gray-600">
          <T k="credits.notActive" />
        </p>
      ) : (
        <>
          <div className="card p-4 space-y-1">
            <p id="credits-balance" data-balance={data.balance} className="text-xl font-bold text-primary">
              {t("credits.balance", undefined, { n: formatNumber(data.balance, lang) })}
            </p>
            <p className="text-xs text-gray-500">
              <T k="credits.howItWorks" />
            </p>
          </div>

          <form onSubmit={submit} className="card p-4 space-y-3 text-xs">
            <h2 className="text-sm font-bold text-gray-900">
              <T k="credits.buy" />
            </h2>
            <div className="space-y-1.5">
              {data.packs.map((p: { credits: number; priceBdt: number }, i: number) => (
                <label key={i} className="flex items-center gap-2">
                  <input type="radio" name="pack" checked={packIndex === i} onChange={() => setPackIndex(i)} />
                  <span>{t("credits.pack", undefined, { credits: formatNumber(p.credits, lang), price: formatMoney(p.priceBdt, lang) })}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              {["BKASH", "NAGAD"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`px-3 py-2 rounded-lg border font-semibold ${method === m ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-700"}`}
                >
                  <T k={`method.${m}`} />
                </button>
              ))}
            </div>
            <p className="text-gray-600">
              {receiver
                ? t("credits.payTo", undefined, { method: t(`method.${method}`), number: receiver })
                : t("credits.receiverMissing")}
            </p>
            <label className="block space-y-1">
              <span className="text-gray-500">
                <T k="credits.trxId" />
              </span>
              <input id="credits-trx" value={trxId} onChange={(e) => setTrxId(e.target.value)} className="w-full p-2.5 rounded-lg border border-gray-200 font-mono" />
            </label>
            <label className="block space-y-1">
              <span className="text-gray-500">
                <T k="credits.sender" />
              </span>
              <input id="credits-sender" type="tel" value={sender} onChange={(e) => setSender(e.target.value)} className="w-full p-2.5 rounded-lg border border-gray-200" />
            </label>
            {error && <p className="text-red-600">{error}</p>}
            {message && <p id="credits-submitted" className="text-emerald-700">{message}</p>}
            <button type="submit" id="credits-submit" disabled={!trxId.trim() || !sender.trim()} className="w-full py-2.5 rounded-lg bg-primary text-white font-semibold disabled:opacity-50">
              <T k="credits.submit" />
            </button>
          </form>

          {data.payments.length > 0 && (
            <section className="card p-4 space-y-1.5 text-xs">
              <h2 className="text-sm font-bold text-gray-900">
                <T k="credits.payments" />
              </h2>
              {data.payments.map((p: any) => (
                <div key={p.id} className="flex justify-between gap-2">
                  <span className="font-mono">{p.trxId}</span>
                  <span>{t(`credits.status.${p.status}`)}</span>
                </div>
              ))}
            </section>
          )}

          <section className="card p-4 space-y-1.5 text-xs">
            <h2 className="text-sm font-bold text-gray-900">
              <T k="credits.history" />
            </h2>
            {data.ledger.map((l: any) => (
              <div key={l.id} className="flex justify-between gap-2">
                <span>
                  {t(`credits.reason.${l.reason}`)}
                  {" · "}
                  {formatDate(l.createdAt, lang)}
                </span>
                <span className={l.delta > 0 ? "text-emerald-700 font-semibold" : "text-gray-700 font-semibold"}>
                  {(l.delta > 0 ? "+" : "") + formatNumber(l.delta, lang)}
                </span>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
