"use client";

import { useState, useEffect } from "react";
import { Users, UserPlus, Shield, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { T, useT } from "@/components/ui/T";

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

interface PendingInvite {
  id: string;
  phone?: string | null;
  email?: string | null;
  role: "MANAGER" | "STAFF";
  expiresAt: string;
}

export default function BusinessMembersPage() {
  const t = useT();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>("STAFF");
  const [target, setTarget] = useState("");
  const [inviteRole, setInviteRole] = useState<"MANAGER" | "STAFF">("STAFF");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [membersRes, invitesRes] = await Promise.all([
        fetch("/api/business/members"),
        fetch("/api/business/invites"),
      ]);

      if (membersRes.ok) {
        const data = await membersRes.json();
        setMembers(data.members || []);
        setCurrentUserRole(data.currentUserRole || "STAFF");
      }
      if (invitesRes.ok) {
        const data = await invitesRes.json();
        setInvites(data.invites || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const isEmail = target.includes("@");
      const body = {
        role: inviteRole,
        ...(isEmail ? { email: target } : { phone: target }),
      };

      const res = await fetch("/api/business/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error);
      }

      setTarget("");
      setSuccess("common.success");
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/business/invites/${inviteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      await loadData();
    } catch (err: any) {
      setError(err.message);
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

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-lg font-bold text-gray-900 leading-none">
            <T k="business.membersTitle" />
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            <T k="business.membersSubtitle" />
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

      {/* Invite Member Form (OWNER only) */}
      {isOwner && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-xs text-gray-900">
              <T k="business.invite" />
            </h3>
          </div>

          <form onSubmit={handleSendInvite} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                <T k="business.inviteEmailOrPhone" />
              </label>
              <input
                type="text"
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="+8801... / user@company.com"
                className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                <T k="business.type" />
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none text-gray-900 font-medium"
              >
                <option value="STAFF">{t("business.roleStaff")}</option>
                <option value="MANAGER">{t("business.roleManager")}</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-3 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {submitting ? <T k="common.loading" /> : <T k="business.inviteButton" />}
            </button>
          </form>
        </div>
      )}

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <h3 className="font-semibold text-xs text-gray-900">
            <T k="business.pendingInvites" />
          </h3>
          <div className="divide-y divide-gray-100 text-xs">
            {invites.map((inv) => (
              <div key={inv.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{inv.phone || inv.email}</p>
                  <p className="text-[11px] text-gray-400 font-mono">{inv.role}</p>
                </div>
                {isOwner && (
                  <button
                    onClick={() => handleRevokeInvite(inv.id)}
                    className="p-1.5 text-secondary hover:bg-red-50 rounded-lg transition-colors"
                    title="Revoke"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current Members List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <h3 className="font-semibold text-xs text-gray-900">
          <T k="business.currentMembers" />
        </h3>
        <div className="divide-y divide-gray-100 text-xs">
          {members.map((m) => (
            <div key={m.id} className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{m.user.name}</p>
                <p className="text-[11px] text-gray-500 font-mono">
                  {m.user.phone || m.user.email}
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  m.role === "OWNER"
                    ? "bg-primary/10 text-primary"
                    : m.role === "MANAGER"
                    ? "bg-blue-50 text-blue-700"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
