"use client";

import { useState, useEffect } from "react";
import { Settings, Shield, AlertTriangle, CheckCircle2, Building2, UserCheck } from "lucide-react";
import { T } from "@/components/ui/T";

interface Member {
  id: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  user: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
  };
}

export default function BusinessSettingsPage() {
  const [business, setBusiness] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>("STAFF");
  const [newOwnerId, setNewOwnerId] = useState("");
  const [transferId, setTransferId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [bizRes, membersRes] = await Promise.all([
          fetch("/api/business"),
          fetch("/api/business/members"),
        ]);

        if (bizRes.ok) {
          const bData = await bizRes.json();
          const activeBiz = (bData.businesses || []).find(
            (b: any) => b.id === bData.activeBusinessId
          );
          setBusiness(activeBiz);
        }

        if (membersRes.ok) {
          const mData = await membersRes.json();
          setMembers(mData.members || []);
          setCurrentUserRole(mData.currentUserRole || "STAFF");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleInitiateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOwnerId) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/business/ownership/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: newOwnerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setTransferId(data.transferId);
      setSuccess("common.success");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        <T k="common.loading" />
      </div>
    );
  }

  const isOwner = currentUserRole === "OWNER";
  const eligibleMembers = members.filter((m) => m.role !== "OWNER");

  return (
    <div className="page space-y-4">
      {/* Title */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <Settings className="w-4 h-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-none">
            <T k="business.settingsTitle" />
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            <T k="business.settingsSubtitle" />
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <T k={success} />
        </div>
      )}

      {/* Business Details Card */}
      {business && (
        <div className="card p-4.5 space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">{business.name}</h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{business.slug}</p>
            </div>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-semibold rounded-md text-[11px] border border-slate-200/80 dark:border-slate-700/80">
              {business.businessType}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div>
              <span className="text-slate-400 dark:text-slate-500 block text-[10px] font-semibold uppercase tracking-wider">
                <T k="business.area" />
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 block">{business.area}</span>
            </div>
            <div>
              <span className="text-slate-400 dark:text-slate-500 block text-[10px] font-semibold uppercase tracking-wider">
                <T k="business.city" />
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 block">{business.city}</span>
            </div>
          </div>
        </div>
      )}

      {/* Ownership Transfer (OWNER only) */}
      {isOwner && (
        <div className="card p-4.5 space-y-3.5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            <div>
              <h3 className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                <T k="business.transferTitle" />
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <T k="business.transferSubtitle" />
              </p>
            </div>
          </div>

          <form onSubmit={handleInitiateTransfer} className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                <T k="business.selectNewOwner" />
              </label>
              <select
                value={newOwnerId}
                onChange={(e) => setNewOwnerId(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 text-slate-900 dark:text-slate-100 font-medium"
              >
                <option value="">{undefined}</option>
                {eligibleMembers.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting || !newOwnerId}
              className="btn btn-primary w-full text-xs font-semibold"
            >
              {submitting ? <T k="common.loading" /> : <T k="business.initiateTransfer" />}
            </button>
          </form>

          {transferId && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1 dark:bg-slate-900 dark:border-slate-800">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                <T k="common.confirm" />
              </p>
              <p className="text-primary-600 dark:text-primary-400 font-mono text-xs">
                {transferId}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
