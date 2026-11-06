"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ArrowRight, ShieldCheck, Mail, Smartphone, Fingerprint } from "lucide-react";
import { T, useT } from "@/components/ui/T";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { startAuthentication } from "@simplewebauthn/browser";

type AuthMethod = "PHONE" | "EMAIL" | "PASSKEY";

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const [method, setMethod] = useState<AuthMethod>("PHONE");
  const [step, setStep] = useState<"INPUT" | "OTP">("INPUT");

  // Phone state
  const [phone, setPhone] = useState("");

  // Email state
  const [email, setEmail] = useState("");

  // OTP state
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getDestination = (hasBusiness: boolean) => {
    if (typeof window === "undefined") return "/home";
    const params = new URLSearchParams(window.location.search);
    const target = params.get("redirect") || params.get("next");
    if (!hasBusiness) {
      return target ? `/onboarding?next=${encodeURIComponent(target)}` : "/onboarding";
    }
    if (target && target.startsWith("/") && !target.startsWith("//")) {
      return target;
    }
    return "/home";
  };

  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t("auth.invalidPhone"));
      }
      if (data.devCode) {
        setDevCode(data.devCode);
      }
      setStep("OTP");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t("auth.invalidOtp"));
      }
      window.location.href = getDestination(!data.isNewUser && data.hasBusiness);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send email verification code");
      }
      if (data.devCode) {
        setDevCode(data.devCode);
      }
      setStep("OTP");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to verify email code");
      }
      window.location.href = getDestination(!data.isNewUser && data.hasBusiness);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError(null);
    setLoading(true);

    try {
      const optsRes = await fetch("/api/auth/passkey/generate-authentication", {
        method: "POST",
      });
      const options = await optsRes.json();
      if (!optsRes.ok) {
        throw new Error(options.error || "Failed to initiate passkey login");
      }

      const authResponse = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/passkey/verify-authentication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: authResponse,
          challenge: options.challenge,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "Passkey verification failed");
      }

      window.location.href = getDestination(!verifyData.isNewUser && verifyData.hasBusiness);
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        setError(err.message || "Passkey login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMethod = (newMethod: AuthMethod) => {
    setMethod(newMethod);
    setStep("INPUT");
    setError(null);
    setOtp("");
    setDevCode(null);
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[26px]">
          {step === "INPUT" ? (
            <T k="auth.loginTitle" />
          ) : (
            <T k="auth.otpTitle" />
          )}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          {step === "INPUT" ? (
            <T k="auth.enterPhoneSubtitle" />
          ) : (
            <T k="auth.otpSubtitle" />
          )}
        </p>
      </div>

      {/* Multi-Method Tabs */}
      {step === "INPUT" && (
        <div className="mb-6 flex rounded-2xl border border-slate-200/80 bg-slate-100/90 p-1 text-[13px] font-medium shadow-2xs">
          <button
            type="button"
            data-testid="tab-phone"
            onClick={() => switchMethod("PHONE")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${
              method === "PHONE"
                ? "border border-slate-200/50 bg-white font-bold text-teal-800 shadow-xs"
                : "text-slate-600 hover:bg-slate-200/40 hover:text-slate-900"
            }`}
          >
            <Smartphone className="h-4 w-4 text-teal-700" />
            <span>
              <T k="auth.methodPhone" />
            </span>
          </button>
          <button
            type="button"
            data-testid="tab-email"
            onClick={() => switchMethod("EMAIL")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${
              method === "EMAIL"
                ? "border border-slate-200/50 bg-white font-bold text-teal-800 shadow-xs"
                : "text-slate-600 hover:bg-slate-200/40 hover:text-slate-900"
            }`}
          >
            <Mail className="h-4 w-4 text-teal-700" />
            <span>
              <T k="auth.methodEmail" />
            </span>
          </button>
          <button
            type="button"
            data-testid="tab-passkey"
            onClick={() => switchMethod("PASSKEY")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${
              method === "PASSKEY"
                ? "border border-slate-200/50 bg-white font-bold text-teal-800 shadow-xs"
                : "text-slate-600 hover:bg-slate-200/40 hover:text-slate-900"
            }`}
          >
            <Fingerprint className="h-4 w-4 text-teal-700" />
            <span>
              <T k="auth.methodPasskey" />
            </span>
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-700">
          {error}
        </div>
      )}

      {/* STEP 1: INPUT MODES */}
      {step === "INPUT" ? (
        <>
          {/* 1. PHONE INPUT MODE */}
          {method === "PHONE" && (
            <form onSubmit={handleSendPhoneOtp} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  <T k="auth.phone" />
                </label>
                <PhoneInput
                  value={phone}
                  onChange={setPhone}
                  disabled={loading}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 text-sm font-semibold text-white shadow-md shadow-teal-700/20 transition-all hover:from-teal-800 hover:to-emerald-700 hover:shadow-lg hover:shadow-teal-700/30 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
              >
                {loading ? <T k="common.loading" /> : <T k="auth.sendOtp" />}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1 rtl:rotate-180" />
              </button>
            </form>
          )}

          {/* 2. EMAIL INPUT MODE */}
          {method === "EMAIL" && (
            <form onSubmit={handleSendEmailOtp} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  <T k="auth.email" />
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder={t("auth.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white ps-10 pe-3 text-sm font-medium text-slate-900 shadow-2xs transition-all placeholder:text-slate-400 hover:border-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 text-sm font-semibold text-white shadow-md shadow-teal-700/20 transition-all hover:from-teal-800 hover:to-emerald-700 hover:shadow-lg hover:shadow-teal-700/30 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
              >
                {loading ? <T k="common.loading" /> : <T k="auth.sendEmailOtp" />}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1 rtl:rotate-180" />
              </button>
            </form>
          )}

          {/* 3. PASSKEY BIOMETRIC MODE */}
          {method === "PASSKEY" && (
            <div className="space-y-4 py-2 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 shadow-inner">
                <Fingerprint className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  <T k="auth.passkeyTitle" />
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed px-2">
                  <T k="auth.passkeySubtitle" />
                </p>
              </div>

              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={loading}
                className="group relative flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 text-sm font-semibold text-white shadow-md shadow-teal-700/20 transition-all hover:from-teal-800 hover:to-emerald-700 hover:shadow-lg hover:shadow-teal-700/30 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
              >
                <Fingerprint className="h-4 w-4" />
                {loading ? (
                  <T k="common.loading" />
                ) : (
                  <T k="auth.signInWithPasskey" />
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        /* STEP 2: VERIFICATION OTP CODE STEP (Shared for Phone & Email) */
        <form
          onSubmit={
            method === "EMAIL" ? handleVerifyEmailOtp : handleVerifyPhoneOtp
          }
          className="space-y-4"
        >
          {devCode && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-950">
              <div>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  <T k="auth.devCodeLabel" />
                </span>
                <span className="font-mono text-lg font-extrabold tracking-widest text-emerald-900">
                  {devCode}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOtp(devCode)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700"
              >
                <T k="auth.autoFill" />
              </button>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              <T k="auth.enterOtp" />
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                data-testid="otp-input"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="h-12 w-full rounded-xl border border-slate-300 bg-white ps-10 pe-3 text-center font-mono text-lg font-bold tracking-[0.5em] text-slate-900 shadow-2xs transition-all hover:border-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              <T k="auth.devOtpNote" />
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 text-sm font-semibold text-white shadow-md shadow-teal-700/20 transition-all hover:from-teal-800 hover:to-emerald-700 hover:shadow-lg hover:shadow-teal-700/30 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
          >
            {loading ? <T k="common.loading" /> : <T k="auth.verifyOtp" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("INPUT");
              setDevCode(null);
              setOtp("");
            }}
            className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-800 py-1"
          >
            <T k="auth.changePhone" />
          </button>
        </form>
      )}

      <div className="mt-8 flex items-center justify-center gap-1.5 border-t border-slate-100 pt-5 text-xs text-slate-500">
        <ShieldCheck className="h-4 w-4 shrink-0 text-teal-700" />
        <span>
          <T k="auth.securityBadge" />
        </span>
        <span className="text-slate-300">{"·"}</span>
        <span className="text-slate-400">
          <T k="landing.enterpriseSecurity" />
        </span>
      </div>
    </div>
  );
}
