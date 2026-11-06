import { T } from "@/components/ui/T";
import { Brand } from "@/components/layout/Brand";
import { VALUE_PROPS } from "@/components/marketing/ValueProps";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/** Sign-in and onboarding: elevated modern B2B marketplace experience with ambient mesh backdrop, glassmorphic card, and metric indicators */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-slate-50 antialiased">
      {/* Ambient background glow and architectural micro-pattern */}
      <div className="pointer-events-none absolute -top-40 start-1/2 -translate-x-1/2 w-[850px] h-[480px] bg-gradient-to-tr from-teal-500/12 via-emerald-400/10 to-cyan-400/8 blur-[110px] rounded-full" />
      <div className="pointer-events-none absolute -bottom-40 end-0 w-[550px] h-[400px] bg-gradient-to-bl from-teal-600/8 via-cyan-500/6 to-transparent blur-[100px] rounded-full" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: "radial-gradient(#0F766E 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Top minimal navigation bar */}
      <header className="relative z-10 w-full px-4 pt-4 sm:px-8 sm:pt-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Brand href="/" />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs backdrop-blur-xs transition-all hover:border-teal-300 hover:text-teal-900 hover:shadow-xs"
          >
            <T k="nav.home" />
            <ArrowUpRight className="h-3.5 w-3.5 rtl:rotate-[-90deg]" />
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-[1080px] animate-fade-up overflow-hidden rounded-[24px] sm:rounded-[32px] border border-slate-200/90 bg-white shadow-[0_24px_70px_-12px_rgba(15,118,110,0.12),0_1px_2px_rgba(0,0,0,0.04)] lg:grid lg:grid-cols-12">
          {/* Left Hero Column: Brand Story & Real-time Value Props */}
          <div className="relative flex flex-col justify-between overflow-hidden border-b border-slate-100 bg-gradient-to-br from-slate-50/90 via-teal-50/25 to-emerald-50/15 p-6 sm:p-9 lg:col-span-7 lg:border-b-0 lg:border-e lg:border-slate-100 lg:p-12">
            {/* Top Badge */}
            <div>
              <div className="flex items-center gap-2.5">
                {/* Rotating Three Dot Triangle Animation */}
                <div className="relative flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 overflow-visible"
                    fill="none"
                  >
                    <g>
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 12 12"
                        to="360 12 12"
                        dur="2.8s"
                        repeatCount="indefinite"
                      />
                      {/* Top Dot */}
                      <circle cx="12" cy="4" r="2.5" className="fill-emerald-600">
                        <animate attributeName="cy" values="4; 5.5; 4" dur="1.4s" repeatCount="indefinite" />
                        <animate attributeName="r" values="2.2; 2.9; 2.2" dur="1.4s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.8; 1; 0.8" dur="1.4s" repeatCount="indefinite" />
                      </circle>
                      {/* Bottom-Right Dot */}
                      <circle cx="18.5" cy="16.5" r="2.5" className="fill-teal-700">
                        <animate attributeName="cx" values="18.5; 16.8; 18.5" dur="1.4s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="16.5; 15; 16.5" dur="1.4s" repeatCount="indefinite" />
                        <animate attributeName="r" values="2.9; 2.2; 2.9" dur="1.4s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="1; 0.8; 1" dur="1.4s" repeatCount="indefinite" />
                      </circle>
                      {/* Bottom-Left Dot */}
                      <circle cx="5.5" cy="16.5" r="2.5" className="fill-emerald-500">
                        <animate attributeName="cx" values="5.5; 7.2; 5.5" dur="1.4s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="16.5; 15; 16.5" dur="1.4s" repeatCount="indefinite" />
                        <animate attributeName="r" values="2.3; 2.8; 2.3" dur="1.4s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.85; 0.6; 0.85" dur="1.4s" repeatCount="indefinite" />
                      </circle>
                    </g>
                  </svg>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
                  <T k="landing.liveExchangeBadge" />
                </span>
              </div>

              <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl lg:text-[32px] lg:leading-[1.18]">
                <T k="landing.heroTitle" />
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                <T k="landing.heroSubtitle" />
              </p>
            </div>

            {/* Middle Feature Cards */}
            <div className="my-6 hidden space-y-3 lg:block">
              {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="group flex items-start gap-4 rounded-2xl border border-slate-200/60 bg-white/80 p-3.5 shadow-2xs backdrop-blur-xs transition-all hover:border-teal-300 hover:bg-white hover:shadow-xs"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-700 to-emerald-600 text-white shadow-sm shadow-teal-700/20 transition-transform group-hover:scale-105">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900 transition-colors group-hover:text-teal-900">
                      <T k={title} />
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                      <T k={body} />
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Metrics Bar */}
            <div className="hidden border-t border-slate-200/60 pt-5 lg:grid lg:grid-cols-3 lg:gap-3">
              <div className="rounded-xl border border-slate-200/60 bg-white/70 p-3 shadow-2xs">
                <div className="text-base font-bold text-teal-800">
                  <T k="landing.statTimeVal" />
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                  <T k="landing.statTimeLabel" />
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white/70 p-3 shadow-2xs">
                <div className="text-base font-bold text-teal-800">
                  <T k="landing.statVerifiedVal" />
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                  <T k="landing.statVerifiedLabel" />
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white/70 p-3 shadow-2xs">
                <div className="text-base font-bold text-teal-800">
                  <T k="landing.statSpreadVal" />
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                  <T k="landing.statSpreadLabel" />
                </div>
              </div>
            </div>
          </div>

          {/* Right Interaction Column: Dynamic Form */}
          <div className="flex flex-col justify-center bg-white p-6 sm:p-9 lg:col-span-5 lg:p-11">
            {children}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-5 text-center text-xs text-slate-500">
        <T k="landing.footer" />
      </footer>
    </div>
  );
}
