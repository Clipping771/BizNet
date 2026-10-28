import Link from "next/link";
import { ArrowRight, ShieldCheck, BadgeCheck, Star, Truck } from "lucide-react";
import { T } from "@/components/ui/T";
import { Num, DaysText, Money, TNum } from "@/components/ui/Num";
import { Brand } from "@/components/layout/Brand";
import { VALUE_PROPS } from "@/components/marketing/ValueProps";
import { getSession } from "@/lib/session";

/** Illustrative quote comparison shown in the hero; the numbers are a design sample, not live data. */
const SAMPLE_QUOTES = [
  { name: "Dhaka Pack House", price: 6.8, days: 2, rating: 4.8, best: true },
  { name: "Green Box BD", price: 7.2, days: 1, rating: 4.6, best: false },
  { name: "Mirpur Plastics", price: 7.9, days: 3, rating: 4.3, best: false },
];

export default async function LandingPage() {
  const session = await getSession();
  const loggedIn = !!session.isLoggedIn;

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
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-3 py-1.5 text-[13px] font-medium text-primary-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              <T k="landing.trustBadge" />
            </span>
            <h1 className="mt-6 text-[40px] font-medium leading-[1.12] tracking-[-0.02em] text-gray-900 sm:text-[56px]">
              <T k="landing.heroTitle" />
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg">
              <T k="landing.heroSubtitle" />
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
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
            <div className="relative rounded-[28px] bg-primary-50 p-4 sm:p-6">
              <div className="rounded-2xl bg-white p-5 shadow-raised">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    <TNum k="landing.sampleItem" n={500} />
                  </p>
                  <p className="text-xs text-gray-500">
                    <T k="category.containers" />
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  <T k="reqStatus.OPEN" />
                </span>
              </div>
              <ul className="mt-4 space-y-2.5">
                {SAMPLE_QUOTES.map((q) => (
                  <li
                    key={q.name}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${q.best ? "border-primary-300 bg-primary-50" : "border-gray-200"}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-primary-800 ring-1 ring-gray-200">
                      {q.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-sm font-semibold text-gray-900">
                        {q.name}
                        <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary-600" />
                      </p>
                      <p className="flex items-center gap-3 text-xs text-gray-500">
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
                    <p className="text-end text-sm font-bold tabular-nums text-gray-900">
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

      <section className="bg-surface-canvas">
        <div className="mx-auto grid max-w-6xl gap-5 px-4 py-16 sm:px-6 md:grid-cols-3">
          {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-[24px] bg-white p-7">
              <span className="icon-tile h-11 w-11">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-gray-900">
                <T k={title} />
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
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
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-lg font-semibold text-primary-900">
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
