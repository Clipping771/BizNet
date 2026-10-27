"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Inbox, MapPin, Calendar, Clock, ChevronRight } from "lucide-react";
import { T } from "@/components/ui/T";
import { formatDate } from "@/lib/dates";

export default function SupplierInboxPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/requests/inbox")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setRequests(data);
        }
      })
      .catch((err) => console.error("Inbox fetch error:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-md mx-auto space-y-4 pb-16">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="text-base font-bold text-gray-900">
            <T k="nav.inbox" />
          </h1>
          <p className="text-xs text-gray-400"><T k="inbox.subtitle" /></p>
        </div>
      </div>

      <div className="space-y-3">
        {requests.map((req) => (
          <Link
            key={req.id}
            href={`/requests/${req.code}`}
            id={`inbox-request-${req.code}`}
            className="block bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:border-primary/40 transition-all space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                <T k={`cat.${req.category.slug}`} />
              </span>
              <span className="text-[10px] font-mono text-gray-400">{req.code}</span>
            </div>

            <h2 className="text-xs font-bold text-gray-900">{req.title}</h2>

            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                <span>{req.deliveryArea}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span>{formatDate(req.neededBy)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-gray-50 text-[11px]">
              <span className="font-semibold text-gray-700">
                {req.quantity?.toString()} {req.unit}
              </span>
              <span className="text-primary font-bold flex items-center gap-0.5">
                <span><T k="inbox.viewAndQuote" /></span>
                <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </Link>
        ))}

        {!loading && requests.length === 0 && (
          <div className="text-center py-12 bg-white rounded-3xl border border-gray-100 text-xs text-gray-400 space-y-2">
            <Inbox className="w-8 h-8 mx-auto text-gray-300" />
            <p><T k="inbox.empty" /></p>
          </div>
        )}
      </div>
    </div>
  );
}
