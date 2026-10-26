"use client";

import React, { useState, useEffect } from "react";
import { Clock, Plus, CheckCircle2, AlertCircle } from "lucide-react";
import { T, useT } from "@/components/ui/T";

interface OpsTimeEntry {
  id: string;
  activity: string;
  minutes: number;
  refType?: string | null;
  refId?: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
  };
}

export default function AdminOpsTimePage() {
  const t = useT();
  const [logs, setLogs] = useState<OpsTimeEntry[]>([]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [activity, setActivity] = useState("");
  const [minutes, setMinutes] = useState("");
  const [refType, setRefType] = useState("");
  const [refId, setRefId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/admin/ops-time");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotalMinutes(data.totalMinutes || 0);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/ops-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity,
          minutes: Number(minutes),
          refType: refType || null,
          refId: refId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to log ops time");
      }

      setSuccess(t("admin.opsTime.success"));
      setActivity("");
      setMinutes("");
      setRefType("");
      setRefId("");
      await fetchLogs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto p-4 text-center text-sm text-slate-500">
        <T k="common.loading" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-600" />
              <T k="admin.opsTime.title" />
            </h1>
            <p className="text-xs text-slate-500">
              <T k="admin.opsTime.subtitle" />
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 block">
              <T k="admin.opsTime.totalMinutes" />
            </span>
            <span className="text-base font-bold text-emerald-600 font-mono">
              {totalMinutes}
            </span>
          </div>
        </div>
      </div>

      {/* Manual Log Form */}
      <form onSubmit={handleLogSubmit} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-emerald-600" />
          <T k="admin.opsTime.log" />
        </h2>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              <T k="admin.opsTime.activity" />
            </label>
            <input
              type="text"
              required
              placeholder="verification_review"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              <T k="admin.opsTime.minutes" />
            </label>
            <input
              type="number"
              min="1"
              required
              placeholder="30"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              <T k="admin.opsTime.refType" />
            </label>
            <input
              type="text"
              placeholder="VerificationRequest"
              value={refType}
              onChange={(e) => setRefType(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              <T k="admin.opsTime.refId" />
            </label>
            <input
              type="text"
              value={refId}
              onChange={(e) => setRefId(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-sm transition shadow-sm disabled:opacity-50"
        >
          {submitting ? t("common.loading") : t("admin.opsTime.submit")}
        </button>
      </form>

      {/* Recent Logs List */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
        <h2 className="text-sm font-bold text-slate-900">
          <T k="admin.opsTime.recentLogs" />
        </h2>

        {logs.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">
            <T k="admin.verifications.empty" />
          </p>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {logs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800 block">{log.activity}</span>
                  <span className="text-[11px] text-slate-400 block">
                    <span>{log.user.name}</span>
                    {log.refType && (
                      <>
                        <span>{" · "}</span>
                        <span>{log.refType}</span>
                      </>
                    )}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-mono">
                    <span>{log.minutes}</span>
                    <span>{" "}</span>
                    <T k="admin.opsTime.minutes" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
