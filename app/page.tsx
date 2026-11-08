import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  ChatsCircle,
  CheckCircle,
  Coins,
  GlobeHemisphereWest,
  Lightning,
  Scales,
  SealCheck,
  Storefront,
  Translate,
  ChatTeardropText,
  Handshake,
} from "@phosphor-icons/react/dist/ssr";
import { T } from "@/components/ui/T";
import { Num, DaysText, Money, TNum } from "@/components/ui/Num";
import { Brand } from "@/components/layout/Brand";
import { LegalLinks } from "@/components/marketing/LegalLinks";
import { InstantAnswer } from "@/components/instant/InstantAnswer";
import { CategoryVisual } from "@/components/ui/CategoryVisual";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Sparkline, formatChange, percentChange } from "@/components/marketing/Sparkline";
import { CURRENCIES } from "@/lib/currencies";
import { listActiveCategories } from "@/lib/repo/category";
import { landingStats, priceTrends } from "@/lib/repo/home";
import { getSession } from "@/lib/session";

/** Hero illustration only: clearly labelled as an example, with invented suppliers and amounts. */
const SAMPLE_QUOTES = [
  { name: "Supplier A", price: 60, days: 2, best: true },
  { name: "Supplier B", price: 64, days: 1, best: false },
  { name: "Supplier C", price: 68, days: 3, best: false },
];

const STEPS = [
  { icon: ChatTeardropText, k: "home.step1" },
  { icon: Scales, k: "home.step2" },
  { icon: Handshake, k: "home.step3" },
];

const WHY = [
  { icon: Lightning, title: "landing.feature1Title", body: "landing.feature1Body", tone: "bg-amber-50 text-amber-600 ring-amber-100" },
  { icon: SealCheck, title: "landing.feature2Title", body: "landing.feature2Body", tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  { icon: Scales, title: "landing.feature3Title", body: "landing.feature3Body", tone: "bg-violet-50 text-violet-600 ring-violet-100" },
];

export default async function LandingPage() {
  const session = await getSession();
  if (session.isLoggedIn) {
    redirect("/home");
  }
  const [categories, trends, stats] = await Promise.all([
    listActiveCategories().catch(() => []),
    priceTrends(10).catch(() => []),
    landingStats().catch(() => ({ suppliers: 0, listings: 0, quotes: 0 })),
  ]);
  const slugs = categories.map((c) => c.slug).filter((s) => s !== "other");
  const statItems = [
    { n: stats.suppliers, k: "landing.stats.suppliers" },
    { n: stats.listings, k: "landing.stats.listings" },
    { n: stats.quotes, k: "landing.stats.quotes" },
  ].filter((s) => s.n > 0);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Brand href="/" />
          <nav className="hidden items-center gap-1 md:flex">
            {[
              { href: "/search", k: "landing.nav.suppliers" },
              { href: "/prices", k: "nav.prices" },
              { href: "/q", k: "nav.discuss" },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
                <T k={l.k} />
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">
              <T k="auth.login" />
            </Link>
            <Link href="/login" className="btn btn-primary">
              <T k="landing.getStarted" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute -top-40 end-[-10%] h-[520px] w-[520px] rounded-full bg-primary-300/30 blur-[110px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 start-[-10%] h-[420px] w-[420px] rounded-full bg-sky-200/40 blur-[110px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:px-8 lg:pb-24 lg:pt-20">
          <div className="animate-fade-up">
            <span className="kicker">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
              </span>
              <T k="landing.trustBadge" />
            </span>
            <h1 className="mt-5 text-[38px] font-extrabold leading-[1.05] tracking-[-0.035em] text-slate-900 sm:text-[52px] lg:text-[62px]">
              <T k="landing.heroTitle" />
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              <T k="landing.heroSubtitle" />
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="btn btn-primary btn-lg">
                <T k="landing.getStarted" />
                <ArrowRight size={18} weight="bold" className="rtl:rotate-180" />
              </Link>
              <Link href="/search" className="btn btn-secondary btn-lg">
                <T k="landing.nav.suppliers" />
              </Link>
            </div>

            {statItems.length > 0 && (
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-slate-200/70 pt-6 sm:gap-8">
                {statItems.map((s) => (
                  <div key={s.k}>
                    <dt className="sr-only">
                      <T k={s.k} />
                    </dt>
                    <dd className="text-2xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-3xl">
                      <Num n={s.n} />
                    </dd>
                    <dd className="mt-0.5 text-xs leading-snug text-slate-500 sm:text-sm">
                      <T k={s.k} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="animate-fade-up [animation-delay:120ms]">
            <div className="relative rounded-[28px] border border-white/60 bg-white/60 p-3 shadow-glow backdrop-blur-sm sm:p-4">
              <p className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-slate-700">
                <Lightning size={16} weight="fill" className="text-amber-500" />
                <T k="landing.hero.tryIt" />
              </p>
              <InstantAnswer
                placeholder={
                  <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white text-slate-900 shadow-card" aria-hidden="true">
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          <TNum k="landing.sampleItem" n={500} />
                        </p>
                        <p className="text-xs text-slate-500">
                          <T k="landing.sampleLabel" />
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-100">
                        <T k="reqStatus.OPEN" />
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {SAMPLE_QUOTES.map((q) => (
                        <li key={q.name} className={`flex items-center gap-3 px-5 py-3.5 ${q.best ? "bg-primary-50/60" : ""}`}>
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${q.best ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                            {q.name.slice(-1)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                              {q.name}
                              {q.best && (
                                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                                  <T k="quote.bestFit" />
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-slate-500">
                              <DaysText n={q.days} />
                            </span>
                          </span>
                          <span className="text-base font-bold tabular-nums text-slate-900">
                            <Money n={q.price} currency="USD" />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* Live market prices */}
      {trends.length > 0 && (
        <section className="border-y border-slate-200/70 bg-slate-50/70">
          <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <Link href="/prices" className="hidden shrink-0 items-center gap-2 text-sm font-semibold text-slate-900 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <T k="landing.prices.title" />
            </Link>
            <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
              <ul className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]">
                {[...trends, ...trends].map((p, i) => {
                  const change = percentChange(p.history);
                  return (
                    <li key={`${p.id}-${i}`} aria-hidden={i >= trends.length ? "true" : undefined}>
                      <Link href="/prices" className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 shadow-card transition-colors hover:border-primary-200">
                        <CategoryVisual slug={p.categorySlug} size={16} className="h-7 w-7 rounded-lg" />
                        <span className="text-[13px] font-medium text-slate-700">
                          <T k={`category.${p.categorySlug}`} />
                        </span>
                        <span className="text-[13px] font-bold tabular-nums text-slate-900">
                          <Money n={p.median} currency={p.currency} />
                          <span className="font-normal text-slate-400">/{p.unit}</span>
                        </span>
                        <Sparkline values={p.history} up={change === null ? undefined : change > 0} />
                        {change !== null && Math.abs(change) >= 0.5 && (
                          <span className={`text-xs font-semibold tabular-nums ${change > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                            {formatChange(change)}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Categories */}
      {slugs.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-3xl font-bold tracking-[-0.025em] text-slate-900 sm:text-4xl">
                <T k="landing.categories.title" />
              </h2>
              <p className="mt-2 text-base text-slate-600">
                <T k="landing.categories.subtitle" />
              </p>
            </div>
            <Link href="/search" className="link inline-flex items-center gap-1.5 text-sm">
              <T k="landing.categories.browse" />
              <ArrowRight size={14} weight="bold" className="rtl:rotate-180" />
            </Link>
          </div>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {slugs.map((slug) => (
              <li key={slug}>
                <Link
                  href={`/search?category=${slug}`}
                  className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-b from-white to-slate-50 p-4 transition-all duration-200 hover:-translate-y-1 hover:border-primary-200 hover:shadow-raised sm:p-5"
                >
                  <CategoryVisual slug={slug} size={30} className="h-14 w-14 rounded-2xl transition-transform duration-300 group-hover:scale-110 sm:h-16 sm:w-16" />
                  <span className="mt-6 flex items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold leading-snug text-slate-900">
                      <T k={`category.${slug}`} />
                    </span>
                    <ArrowRight size={16} weight="bold" className="shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-primary-600 rtl:rotate-180" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* How it works */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div aria-hidden="true" className="bg-grid-inverted pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute -top-32 start-1/2 h-80 w-[640px] -translate-x-1/2 rounded-full bg-primary-600/30 blur-[120px]" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-primary-200 ring-1 ring-inset ring-white/15">
              <T k="landing.step.label" />
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-[-0.025em] sm:text-4xl">
              <T k="home.howItWorks" />
            </h2>
            <p className="mt-3 text-base text-slate-400">
              <T k="landing.how.subtitle" />
            </p>
          </div>
          <ol className="mt-12 grid gap-4 md:grid-cols-3 md:gap-6">
            {STEPS.map(({ icon: Icon, k }, i) => (
              <li key={k} className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-400 to-primary-700 text-white shadow-fab">
                    <Icon size={24} weight="duotone" />
                  </span>
                  <span className="text-5xl font-extrabold tabular-nums text-white/10">
                    <Num n={i + 1} />
                  </span>
                </div>
                <p className="mt-6 text-lg font-semibold leading-snug text-white">
                  <T k={k} />
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why BizNet */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <h2 className="max-w-2xl text-3xl font-bold tracking-[-0.025em] text-slate-900 sm:text-4xl">
          <T k="landing.why.title" />
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3 lg:gap-6">
          {WHY.map(({ icon: Icon, title, body, tone }) => (
            <div key={title} className="card p-6 transition-shadow hover:shadow-raised lg:p-7">
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ring-inset ${tone}`}>
                <Icon size={24} weight="duotone" />
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-900">
                <T k={title} />
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                <T k={body} />
              </p>
            </div>
          ))}
        </div>
        <ul className="mt-4 grid gap-4 md:grid-cols-3 lg:mt-6 lg:gap-6">
          {[
            { icon: GlobeHemisphereWest, k: "landing.global.anywhere" },
            { icon: Coins, k: "landing.global.currencies", extra: CURRENCIES.join(" · ") },
            { icon: Translate, k: "landing.global.languages" },
          ].map(({ icon: Icon, k, extra }) => (
            <li key={k} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-5">
              <Icon size={22} weight="duotone" className="mt-0.5 shrink-0 text-primary-600" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-snug text-slate-800">
                  <T k={k} />
                </span>
                {extra && <span className="mt-1 block text-xs tracking-wide text-slate-500">{extra}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* For suppliers */}
      <section className="px-4 sm:px-6 lg:px-8">
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800 p-7 text-white sm:p-10 lg:grid-cols-2 lg:p-14">
          <div aria-hidden="true" className="bg-grid-inverted pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-white/20">
              <Storefront size={14} weight="fill" />
              <T k="landing.supplier.kicker" />
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-[-0.025em] sm:text-4xl">
              <T k="landing.supplier.title" />
            </h2>
            <p className="mt-3 max-w-lg text-base leading-relaxed text-primary-100">
              <T k="landing.supplier.body" />
            </p>
            <Link href="/login" className="btn btn-lg mt-7 bg-white text-primary-700 shadow-raised hover:bg-primary-50">
              <T k="landing.supplier.cta" />
              <ArrowRight size={18} weight="bold" className="rtl:rotate-180" />
            </Link>
          </div>
          <ul className="relative grid gap-3">
            {["landing.supplier.point1", "landing.supplier.point2", "landing.supplier.point3"].map((k) => (
              <li key={k} className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/15 backdrop-blur-sm">
                <CheckCircle size={22} weight="fill" className="shrink-0 text-emerald-300" />
                <span className="text-[15px] font-medium">
                  <T k={k} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final call */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:py-28">
        <h2 className="text-3xl font-bold tracking-[-0.025em] text-slate-900 sm:text-4xl">
          <T k="landing.cta.title" />
        </h2>
        <p className="mt-3 text-base text-slate-600 sm:text-lg">
          <T k="landing.cta.body" />
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/login" className="btn btn-primary btn-lg">
            <T k="landing.getStarted" />
            <ArrowRight size={18} weight="bold" className="rtl:rotate-180" />
          </Link>
          <Link href="/q" className="btn btn-secondary btn-lg">
            <ChatsCircle size={18} />
            <T k="nav.discuss" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200/70 bg-slate-50/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Brand href="/" />
            <span className="hidden text-xs text-slate-500 sm:inline">
              <T k="landing.footer" />
            </span>
          </div>
          <LegalLinks className="text-slate-500 hover:text-slate-800" />
        </div>
      </footer>
    </div>
  );
}
