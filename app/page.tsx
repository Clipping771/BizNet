import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck, BadgeCheck, Star, Truck } from "lucide-react";
import { T } from "@/components/ui/T";
import { Num, DaysText, Money, TNum } from "@/components/ui/Num";
import { Brand } from "@/components/layout/Brand";
import { VALUE_PROPS } from "@/components/marketing/ValueProps";
import { getSession } from "@/lib/session";

/** Illustrative quote comparison shown in the hero; the numbers are a design sample, not live data. */
const SAMPLE_QUOTES = [
  { name: "Apex Global Packaging", price: 0.12, days: 2, rating: 4.9, best: true },
  { name: "Metro Container & Box Co.", price: 0.15, days: 1, rating: 4.8, best: false },
  { name: "Horizon Eco Packs", price: 0.18, days: 3, rating: 4.7, best: false },
];

export default async function LandingPage() {
  const session = await getSession();
  if (session.isLoggedIn) {
    redirect("/home");
  }

  const loggedIn = false;

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Brand href="/" />
          <Link href={loggedIn ? "/home" : "/login"} className="btn btn-primary">
            <T k={loggedIn ? "nav.home" : "auth.login"} />
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-2 lg:pb-24">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              <T k="landing.trustBadge" />
            </span>
            <h1 className="mt-5 text-[36px] font-semibold leading-[1.12] tracking-[-0.025em] text-slate-900 dark:text-slate-100 sm:text-[50px]">
              <T k="landing.heroTitle" />
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
              <T k="landing.heroSubtitle" />
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href={loggedIn ? "/requests/new" : "/login"} className="btn btn-primary btn-lg">
                <T k={loggedIn ? "home.newRequest" : "landing.getStarted"} />
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
              <Link href={loggedIn ? "/home" : "/login"} className="btn btn-secondary btn-lg">
                <T k={loggedIn ? "nav.home" : "landing.haveAccount"} />
              </Link>
            </div>
          </div>

          {/* Product preview: what comparing quotes looks like */}
          <div className="relative animate-fade-up [animation-delay:120ms]" aria-hidden="true">
            <div className="relative rounded-2xl border border-slate-200/90 bg-slate-100/70 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-[#111827]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    <TNum k="landing.sampleItem" n={500} />
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    <T k="category.containers" />
                  </p>
                </div>
                <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                  <T k="reqStatus.OPEN" />
                </span>
              </div>
              <ul className="mt-3.5 space-y-2">
                {SAMPLE_QUOTES.map((q) => (
                  <li
                    key={q.name}
                    className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                      q.best
                        ? "border-teal-300 bg-teal-50/70"
                        : "border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900/70"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {q.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {q.name}
                        <BadgeCheck className="h-3 w-3 shrink-0 text-teal-700 dark:text-teal-400" />
                      </p>
                      <p className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          <Num n={q.rating} />
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          <DaysText n={q.days} />
                        </span>
                      </p>
                    </div>
                    <p className="text-end text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      <Money n={q.price} />
                    </p>
                  </li>
                ))}
              </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200/80 bg-slate-50/80 dark:border-slate-800 dark:bg-[#0B0F19]/60">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:px-6 md:grid-cols-3">
          {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-6 border border-slate-200/90 dark:border-slate-800">
              <span className="icon-tile h-9 w-9">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <T k={title} />
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                <T k={body} />
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight text-gray-900">
          <T k="home.howItWorks" />
        </h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {["home.step1", "home.step2", "home.step3"].map((k, i) => (
            <li key={k} className="flex flex-col items-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 border border-teal-200 text-lg font-semibold text-teal-800">
                <Num n={i + 1} />
              </span>
              <p className="mt-4 max-w-[16rem] text-sm font-medium text-gray-700">
                <T k={k} />
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-12 flex justify-center">
          <Link href={loggedIn ? "/requests/new" : "/login"} className="btn btn-primary btn-lg">
            <T k={loggedIn ? "home.newRequest" : "landing.getStarted"} />
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-gray-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-gray-500 sm:flex-row sm:px-6">
          <Brand href="/" />
          <T k="landing.footer" />
        </div>
      </footer>
    </div>
  );
}
