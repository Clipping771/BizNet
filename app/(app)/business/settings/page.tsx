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
    <div className="page space-y-5">
      {/* Title */}
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-lg font-bold text-gray-900 leading-none">
            <T k="business.settingsTitle" />
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            <T k="business.settingsSubtitle" />
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-secondary text-xs rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <T k={success} />
        </div>
      )}

      {/* Business Details Card */}
      {business && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-gray-900">{business.name}</h3>
              <p className="text-xs text-gray-400 font-mono">{business.slug}</p>
            </div>
            <span className="px-2 py-0.5 bg-primary/10 text-primary font-semibold rounded text-xs">
              {business.businessType}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs">
            <div>
              <span className="text-gray-400 block text-[11px] uppercase">
                <T k="business.area" />
              </span>
              <span className="font-medium text-gray-800">{business.area}</span>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px] uppercase">
                <T k="business.city" />
              </span>
              <span className="font-medium text-gray-800">{business.city}</span>
            </div>
          </div>
        </div>
      )}

      {/* Ownership Transfer (OWNER only) */}
      {isOwner && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <div>
              <h3 className="font-semibold text-xs text-gray-900">
                <T k="business.transferTitle" />
              </h3>
              <p className="text-xs text-gray-500">
                <T k="business.transferSubtitle" />
              </p>
            </div>
          </div>

          <form onSubmit={handleInitiateTransfer} className="space-y-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                <T k="business.selectNewOwner" />
              </label>
              <select
                value={newOwnerId}
                onChange={(e) => setNewOwnerId(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none text-gray-900 font-medium"
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
              className="w-full py-2.5 px-3 bg-secondary text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {submitting ? <T k="common.loading" /> : <T k="business.initiateTransfer" />}
            </button>
          </form>

          {transferId && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-1">
              <p className="font-semibold text-blue-900">
                <T k="common.confirm" />
              </p>
              <p className="text-blue-700 font-mono text-xs">
                {transferId}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
