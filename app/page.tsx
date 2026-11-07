import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { T } from "@/components/ui/T";
import { Num, DaysText, Money, TNum } from "@/components/ui/Num";
import { Brand } from "@/components/layout/Brand";
import { LegalLinks } from "@/components/marketing/LegalLinks";
import { InstantAnswer } from "@/components/instant/InstantAnswer";
import { VALUE_PROPS } from "@/components/marketing/ValueProps";
import { getSession } from "@/lib/session";

/** Hero illustration only: clearly labelled as an example, with invented suppliers and amounts. */
const SAMPLE_QUOTES = [
  { name: "Supplier A", price: 60, days: 2, best: true },
  { name: "Supplier B", price: 64, days: 1, best: false },
  { name: "Supplier C", price: 68, days: 3, best: false },
];

export default async function LandingPage() {
  const session = await getSession();
  if (session.isLoggedIn) {
    redirect("/home");
  }

  return (
    <div className="min-h-screen bg-white">
      <section className="bg-primary-950 text-white">
        <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Brand href="/" inverted />
          <div className="flex items-center gap-2">
            <Link href="/q" className="hidden rounded-lg px-3 py-2 text-sm text-primary-100 transition-colors hover:text-white sm:block">
              <T k="nav.discuss" />
            </Link>
            <Link href="/prices" className="hidden rounded-lg px-3 py-2 text-sm text-primary-100 transition-colors hover:text-white sm:block">
              <T k="nav.prices" />
            </Link>
            <Link href="/login" className="btn bg-white text-primary-900 hover:bg-primary-50">
              <T k="auth.login" />
            </Link>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-2">
          <div className="animate-fade-up">
            <p className="text-sm font-medium text-amber-300">
              <T k="landing.trustBadge" />
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              <T k="landing.heroTitle" />
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-primary-100/80">
              <T k="landing.heroSubtitle" />
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="btn btn-lg bg-amber-400 font-semibold text-primary-950 hover:bg-amber-300">
                <T k="landing.getStarted" />
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
              <Link href="/login" className="btn btn-lg border border-white/25 text-white hover:bg-white/10">
                <T k="landing.haveAccount" />
              </Link>
            </div>
          </div>

          {/* What comparing quotes looks like */}
          <div className="animate-fade-up [animation-delay:120ms]">
            <InstantAnswer
              placeholder={
          <div className="overflow-hidden rounded-xl bg-white text-slate-900 shadow-pop" aria-hidden="true">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-sm font-semibold">
                  <TNum k="landing.sampleItem" n={500} />
                </p>
                <p className="text-xs text-slate-500">
                  <T k="landing.sampleLabel" />
                </p>
              </div>
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <T k="reqStatus.OPEN" />
              </span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th><T k="order.supplier" /></th>
                  <th><T k="quote.delivery" /></th>
                  <th className="text-end"><T k="orders.col.total" /></th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_QUOTES.map((q) => (
                  <tr key={q.name} className={q.best ? "bg-amber-50" : ""}>
                    <td className="font-medium text-slate-900">
                      {q.name}
                      {q.best && (
                        <span className="ms-2 rounded bg-amber-400 px-1.5 py-0.5 text-[11px] font-semibold text-primary-950">
                          <T k="quote.bestFit" />
                        </span>
                      )}
                    </td>
                    <td><DaysText n={q.days} /></td>
                    <td className="text-end font-semibold"><Money n={q.price} currency="USD" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
              }
            />
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-3">
          {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <Icon className="h-6 w-6 text-primary-700" />
              <h2 className="mt-3 text-[15px] font-semibold text-slate-900">
                <T k={title} />
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                <T k={body} />
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          <T k="home.howItWorks" />
        </h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {["home.step1", "home.step2", "home.step3"].map((k, i) => (
            <li key={k} className="border-t-2 border-primary-700 pt-4">
              <span className="text-sm font-semibold tabular-nums text-primary-700">
                <Num n={i + 1} />
              </span>
              <p className="mt-2 text-[15px] text-slate-700">
                <T k={k} />
              </p>
            </li>
          ))}
        </ol>
        <Link href="/login" className="btn btn-primary btn-lg mt-10">
          <T k="landing.getStarted" />
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
      </section>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="text-xs text-slate-500">
            <T k="landing.footer" />
          </span>
          <LegalLinks className="text-slate-500 hover:text-slate-800" />
        </div>
      </footer>
    </div>
  );
}
