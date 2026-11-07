"use client";

import { useState } from "react";
import { T, useT } from "@/components/ui/T";

const ENTITIES = ["requests", "quotes", "orders", "feedback", "businesses", "opsTime"];
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** CSV export for field validation (§17): pick a data set and a date range. */
export default function AdminExportPage() {
  const t = useT();
  const [entity, setEntity] = useState("requests");
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));

  return (
    <div className="card p-4 space-y-3 text-xs">
      <label className="block space-y-1">
        <span className="text-slate-500">
          <T k="admin.export.entity" />
        </span>
        <select id="export-entity" value={entity} onChange={(e) => setEntity(e.target.value)} className="input">
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {t(`admin.export.${e}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="block text-slate-500">
            <T k="admin.from" />
          </span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </label>
        <label className="space-y-1">
          <span className="block text-slate-500">
            <T k="admin.to" />
          </span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </label>
      </div>
      <a id="export-download" href={`/api/admin/export?entity=${entity}&from=${from}&to=${to}`} className="inline-block px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold">
        <T k="admin.downloadCsv" />
      </a>
    </div>
  );
}
