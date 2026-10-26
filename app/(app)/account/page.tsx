"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  ShieldCheck,
  Building2,
  KeyRound,
  LogOut,
  Trash2,
  Globe,
  Users,
  Settings,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { T } from "@/components/ui/T";
import { startRegistration } from "@simplewebauthn/browser";

interface UserProfile {
  id: string;
  name: string;
  phone?: string | null;
  phoneVerified: boolean;
  email?: string | null;
  emailVerified: boolean;
  role: string;
  activeBusinessId?: string | null;
}

interface BusinessSummary {
  id: string;
  name: string;
  slug: string;
  isBuyer: boolean;
  isSupplier: boolean;
  role?: string;
}

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [accRes, bizRes] = await Promise.all([
          fetch("/api/auth/account"),
          fetch("/api/business"),
        ]);

        if (accRes.ok) {
          const accData = await accRes.json();
          setProfile(accData.user);
        }
        if (bizRes.ok) {
          const bizData = await bizRes.json();
          setBusinesses(bizData.businesses || []);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSwitchBusiness = async (businessId: string) => {
    try {
      const res = await fetch("/api/business/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRegisterPasskey = async () => {
    setError(null);
    setStatusMsg(null);
    setPasskeyLoading(true);

    try {
      const optRes = await fetch("/api/auth/passkey/generate-registration", {
        method: "POST",
      });
      const options = await optRes.json();
      if (!optRes.ok) throw new Error(options.error);

      const attResp = await startRegistration({ optionsJSON: options });
      const verRes = await fetch("/api/auth/passkey/verify-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attResp),
      });
      const verData = await verRes.json();
      if (!verRes.ok) throw new Error(verData.error);

      setStatusMsg("common.success");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm("Are you sure?")) return;
    setError(null);

    try {
      const res = await fetch("/api/auth/account", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push("/login");
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

  return (
    <div className="space-y-4">
      {/* Page Title */}
      <div className="flex items-center gap-2">
        <User className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-gray-900">
          <T k="account.title" />
        </h2>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-secondary text-xs rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {statusMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <T k={statusMsg} />
        </div>
      )}

      {/* User Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-gray-900">{profile?.name}</h3>
            <p className="text-xs text-gray-500 font-mono">{profile?.role}</p>
          </div>
          <span className="px-2.5 py-1 text-xs font-semibold bg-primary/10 text-primary rounded-full">
            <T k="account.profile" />
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 pt-2 border-t border-gray-100 text-xs">
          {profile?.phone && (
            <div className="flex items-center justify-between">
              <span className="text-gray-500 font-mono">{profile.phone}</span>
              {profile.phoneVerified ? (
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <T k="account.verified" />
                </span>
              ) : (
                <span className="text-amber-600">
                  <T k="account.unverified" />
                </span>
              )}
            </div>
          )}
          {profile?.email && (
            <div className="flex items-center justify-between">
              <span className="text-gray-500 font-mono">{profile.email}</span>
              {profile.emailVerified ? (
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <T k="account.verified" />
                </span>
              ) : (
                <span className="text-amber-600">
                  <T k="account.unverified" />
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Active Business Switcher */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <h4 className="font-semibold text-xs text-gray-900">
              <T k="account.activeBusiness" />
            </h4>
          </div>
          <Link
            href="/onboarding"
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            <T k="business.create" />
          </Link>
        </div>

        <div className="divide-y divide-gray-100">
          {businesses.map((biz) => {
            const isActive = biz.id === profile?.activeBusinessId;
            return (
              <div
                key={biz.id}
                className="py-2.5 flex items-center justify-between text-xs"
              >
                <div>
                  <p className="font-semibold text-gray-900">{biz.name}</p>
                  <p className="text-[11px] text-gray-400 font-mono">{biz.slug}</p>
                </div>
                {isActive ? (
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded text-[11px]">
                    <T k="account.verified" />
                  </span>
                ) : (
                  <button
                    onClick={() => handleSwitchBusiness(biz.id)}
                    className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-medium text-[11px]"
                  >
                    <T k="nav.switchBusiness" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Navigation Links */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100 text-xs">
        <Link
          href="/business/members"
          className="flex items-center justify-between p-3.5 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2.5 text-gray-800 font-medium">
            <Users className="w-4 h-4 text-primary" />
            <T k="business.membersTitle" />
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-gray-400 rtl:rotate-180" />
        </Link>

        <Link
          href="/business/settings"
          className="flex items-center justify-between p-3.5 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2.5 text-gray-800 font-medium">
            <Settings className="w-4 h-4 text-primary" />
            <T k="business.settingsTitle" />
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-gray-400 rtl:rotate-180" />
        </Link>

        <Link
          href="/account/language"
          className="flex items-center justify-between p-3.5 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2.5 text-gray-800 font-medium">
            <Globe className="w-4 h-4 text-primary" />
            <T k="common.language" />
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-gray-400 rtl:rotate-180" />
        </Link>
      </div>

      {/* Passkey / Security */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-xs text-gray-900">
            <T k="account.passkeys" />
          </h4>
        </div>
        <button
          onClick={handleRegisterPasskey}
          disabled={passkeyLoading}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
        >
          <ShieldCheck className="w-4 h-4 text-primary" />
          <T k="account.registerPasskey" />
        </button>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50/50 rounded-2xl border border-red-100 p-4 space-y-3">
        <h4 className="font-semibold text-xs text-secondary flex items-center gap-1.5">
          <Trash2 className="w-3.5 h-3.5" />
          <T k="account.dangerZone" />
        </h4>
        <button
          onClick={handleDeleteAccount}
          className="w-full py-2.5 px-3 bg-white border border-red-200 text-secondary hover:bg-red-50 rounded-xl text-xs font-semibold transition-colors"
        >
          <T k="account.deleteAccount" />
        </button>
      </div>
    </div>
  );
}
