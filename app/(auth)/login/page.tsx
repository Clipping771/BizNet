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
      if (data.isNewUser || !data.hasBusiness) {
        router.push("/onboarding");
      } else {
        router.push("/home");
      }
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
      if (data.isNewUser || !data.hasBusiness) {
        router.push("/onboarding");
      } else {
        router.push("/home");
      }
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

      if (verifyData.isNewUser || !verifyData.hasBusiness) {
        router.push("/onboarding");
      } else {
        router.push("/home");
      }
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
    <div>
      <div>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em] text-gray-900">
          {step === "INPUT" ? (
            <T k="auth.loginTitle" />
          ) : (
            <T k="auth.otpTitle" />
          )}
        </h1>
        <p className="mb-8 mt-2 text-[15px] text-gray-600">
          {step === "INPUT" ? (
            <T k="auth.enterPhoneSubtitle" />
          ) : (
            <T k="auth.otpSubtitle" />
          )}
        </p>

        {/* Multi-Method Tabs */}
        {step === "INPUT" && (
          <div className="mb-6 flex rounded-full border border-gray-300 p-1 text-[13px] font-medium">
            <button
              type="button"
              data-testid="tab-phone"
              onClick={() => switchMethod("PHONE")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 transition-all ${
                method === "PHONE"
                  ? "bg-primary-100 text-primary-900"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>
                <T k="auth.methodPhone" />
              </span>
            </button>
            <button
              type="button"
              data-testid="tab-email"
              onClick={() => switchMethod("EMAIL")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 transition-all ${
                method === "EMAIL"
                  ? "bg-primary-100 text-primary-900"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>
                <T k="auth.methodEmail" />
              </span>
            </button>
            <button
              type="button"
              data-testid="tab-passkey"
              onClick={() => switchMethod("PASSKEY")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 transition-all ${
                method === "PASSKEY"
                  ? "bg-primary-100 text-primary-900"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span>
                <T k="auth.methodPasskey" />
              </span>
            </button>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
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
                  <label className="label">
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
                  className="btn btn-primary btn-lg w-full"
                >
                  {loading ? <T k="common.loading" /> : <T k="auth.sendOtp" />}
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </button>
              </form>
            )}

            {/* 2. EMAIL INPUT MODE */}
            {method === "EMAIL" && (
              <form onSubmit={handleSendEmailOtp} className="space-y-4">
                <div>
                  <label className="label">
                    <T k="auth.email" />
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      required
                      placeholder={t("auth.emailPlaceholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input ps-10"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary btn-lg w-full"
                >
                  {loading ? <T k="common.loading" /> : <T k="auth.sendEmailOtp" />}
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </button>
              </form>
            )}

            {/* 3. PASSKEY BIOMETRIC MODE */}
            {method === "PASSKEY" && (
              <div className="space-y-4 py-2 text-center">
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto text-primary">
                  <Fingerprint className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1">
                    <T k="auth.passkeyTitle" />
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed px-2">
                    <T k="auth.passkeySubtitle" />
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={loading}
                  className="btn btn-primary btn-lg mt-2 w-full"
                >
                  <Fingerprint className="w-4 h-4" />
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
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase font-bold text-emerald-700 block tracking-wider">
                    <T k="auth.devCodeLabel" />
                  </span>
                  <span className="text-lg font-mono font-extrabold tracking-widest text-emerald-900">
                    {devCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOtp(devCode)}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <T k="auth.autoFill" />
                </button>
              </div>
            )}

            <div>
              <label className="label">
                <T k="auth.enterOtp" />
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
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
                  className="input h-12 ps-10 text-center font-mono text-lg font-bold tracking-[0.5em]"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                <T k="auth.devOtpNote" />
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-lg w-full"
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
              className="btn btn-ghost btn-sm w-full text-gray-500"
            >
              <T k="auth.changePhone" />
            </button>
          </form>
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5 border-t border-gray-100 pt-5 text-xs text-gray-500">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>
            <T k="auth.securityBadge" />
          </span>
        </div>
      </div>
    </div>
  );
}
