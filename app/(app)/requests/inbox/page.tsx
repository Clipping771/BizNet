"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { T, useLang, useT } from "@/components/ui/T";
import { EmptyState, ListSkeleton } from "@/components/ui/ListStates";
import { formatDate } from "@/lib/dates";
import { formatNumber } from "@/lib/money";

/** Supplier work queue: open requests this business may quote on, newest first (§8.6). */
export default function SupplierInboxPage() {
  const t = useT();
  const lang = useLang();
  const [requests, setRequests] = useState<any[] | null>(null);

  useEffect(() => {
    fetch("/api/requests/inbox")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setRequests(Array.isArray(data) ? data : []))
      .catch(() => setRequests([]));
  }, []);

  return (
    <div className="page-wide space-y-4">
      <div>
        <h1 className="page-title">
          <T k="nav.requestsToQuote" />
        </h1>
        <p className="page-subtitle">
          <T k="inbox.subtitle" />
        </p>
      </div>

      {requests === null ? (
        <ListSkeleton />
      ) : requests.length === 0 ? (
        <EmptyState k="inbox.empty" icon={ClipboardList}>
          <Link href="/business/listings" className="btn btn-secondary btn-sm">
            <T k="nav.listings" />
          </Link>
        </EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th><T k="desk.col.request" /></th>
                <th className="hidden md:table-cell"><T k="rfq.deliveryArea" /></th>
                <th className="hidden sm:table-cell"><T k="desk.col.quantity" /></th>
                <th className="hidden lg:table-cell"><T k="home.stat.neededBy" /></th>
                <th className="text-end"><span className="sr-only">{t("inbox.viewAndQuote")}</span></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id}>
                  <td className="max-w-[20rem]">
                    <Link id={`inbox-request-${req.code}`} href={`/requests/${req.code}`} className="block truncate font-medium text-slate-900 hover:text-primary-700">
                      {req.title}
                    </Link>
                    <span className="text-xs text-slate-500">
                      {t(`category.${req.category.slug}`)} · {req.code}
                    </span>
                  </td>
                  <td className="hidden md:table-cell">{req.deliveryArea}</td>
                  <td className="hidden whitespace-nowrap sm:table-cell">
                    {formatNumber(Number(req.quantity), lang)} {req.unit}
                  </td>
                  <td className="hidden whitespace-nowrap lg:table-cell">{req.neededBy ? formatDate(req.neededBy, lang) : "—"}</td>
                  <td className="text-end">
                    <Link href={`/requests/${req.code}`} className="btn btn-secondary btn-sm">
                      <T k="desk.act.quote" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
