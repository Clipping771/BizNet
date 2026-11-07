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
      <div className="py-12 text-center text-sm text-slate-500">
        <T k="common.loading" />
      </div>
    );
  }

  const isOwner = currentUserRole === "OWNER";

  return (
    <div className="page space-y-5">
      {/* Title */}
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-lg font-bold text-slate-900 leading-none">
            <T k="business.membersTitle" />
          </h2>
          <p className="text-[13px] text-slate-500 mt-0.5">
            <T k="business.membersSubtitle" />
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-secondary text-[13px] rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px] rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <T k={success} />
        </div>
      )}

      {/* Invite Member Form (OWNER only) */}
      {isOwner && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-[13px] text-slate-900">
              <T k="business.invite" />
            </h3>
          </div>

          <form onSubmit={handleSendInvite} className="space-y-3">
            <div>
              <label className="label">
                <T k="business.inviteEmailOrPhone" />
              </label>
              <input
                type="text"
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="+1... / user@company.com"
                className="input"
              />
            </div>

            <div>
              <label className="label">
                <T k="business.memberRole" />
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="input"
              >
                <option value="STAFF">{t("business.roleStaff")}</option>
                <option value="MANAGER">{t("business.roleManager")}</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary btn-sm w-full"
            >
              {submitting ? <T k="common.loading" /> : <T k="business.inviteButton" />}
            </button>
          </form>
        </div>
      )}

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-[13px] text-slate-900">
            <T k="business.pendingInvites" />
          </h3>
          <div className="divide-y divide-slate-100 text-[13px]">
            {invites.map((inv) => (
              <div key={inv.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{inv.phone || inv.email}</p>
                  <p className="text-[13px] text-slate-500 font-mono">{inv.role}</p>
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
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-[13px] text-slate-900">
          <T k="business.currentMembers" />
        </h3>
        <div className="divide-y divide-slate-100 text-[13px]">
          {members.map((m) => (
            <div key={m.id} className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{m.user.name}</p>
                <p className="text-[13px] text-slate-500 font-mono">
                  {m.user.phone || m.user.email}
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[13px] font-semibold ${
                  m.role === "OWNER"
                    ? "bg-primary/10 text-primary"
                    : m.role === "MANAGER"
                    ? "bg-blue-50 text-blue-700"
                    : "bg-slate-100 text-slate-700"
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
