import Link from "next/link";
import {
  Plus,
  Mic,
  Search,
  TrendingUp,
  MessagesSquare,
  ShieldCheck,
  ChevronRight,
  Box,
  Package,
  ShoppingBag,
  CupSoda,
  Sparkles,
} from "lucide-react";
import { T } from "@/components/ui/T";
import { HomeActivity } from "@/components/home/HomeActivity";
import { Num } from "@/components/ui/Num";
import { getSession } from "@/lib/session";
import { findBusinessById } from "@/lib/repo/business";

export default async function HomePage() {
  const session = await getSession();
  const business = session.activeBusinessId ? await findBusinessById(session.activeBusinessId).catch(() => null) : null;

  // Names come from the translation catalog (category.<slug>), never hard-coded text
  const categories = [
    { slug: "containers", icon: Box },
    { slug: "food_boxes", icon: Package },
    { slug: "carry_bags", icon: ShoppingBag },
    { slug: "cups", icon: CupSoda },
  ];

  const actions = [
    { href: "/requests/new", icon: Plus, title: "home.action.request", hint: "home.action.requestHint" },
    { href: "/search", icon: Search, title: "home.action.search", hint: "home.action.searchHint" },
    { href: "/prices", icon: TrendingUp, title: "home.action.prices", hint: "home.action.pricesHint" },
    { href: "/q", icon: MessagesSquare, title: "home.action.discuss", hint: "home.action.discussHint" },
  ];

  return (
    <div className="page-wide space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">
            {business ? <T k="home.hello" params={{ name: business.name }} /> : <T k="home.helloGuest" />}
          </h1>
          <p className="page-subtitle">
            <T k="home.overview" />
          </p>
        </div>
      </div>

      {/* AI request assistant */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 p-6 text-white shadow-raised sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 end-24 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/90 ring-1 ring-inset ring-white/20">
              <Sparkles className="h-3 w-3" />
              <T k="home.aiBadge" />
            </span>
            <h2 className="mt-3 text-xl font-bold leading-snug sm:text-2xl">
              <T k="home.aiTitle" />
            </h2>
            <p className="mt-1.5 text-sm text-white/75">
              <T k="home.aiSubtitle" />
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2.5">
            <Link href="/requests/new" className="btn btn-lg bg-white text-primary-800 shadow-sm hover:bg-primary-50">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <T k="home.newRequest" />
            </Link>
            <Link href="/requests/new" aria-label="voice" className="btn btn-lg w-12 bg-white/15 px-0 text-white ring-1 ring-inset ring-white/25 hover:bg-white/25">
              <Mic className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <HomeActivity />
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="card p-2">
            <h2 className="section-title px-3 pb-1 pt-3">
              <T k="home.quickActions" />
            </h2>
            <ul>
              {actions.map(({ href, icon: Icon, title, hint }) => (
                <li key={href + title}>
                  <Link href={href} className="group flex items-center gap-3 rounded-xl p-3 transition hover:bg-gray-50">
                    <span className="icon-tile">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900">
                        <T k={title} />
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        <T k={hint} />
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-300 transition group-hover:text-gray-500 rtl:rotate-180" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">
                <T k="home.popularCategories" />
              </h2>
              <Link href="/search" className="text-xs font-semibold text-primary-700 hover:underline">
                <T k="common.viewAll" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {categories.map(({ slug, icon: Icon }) => (
                <Link
                  key={slug}
                  href={`/search?category=${slug}`}
                  className="group flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3 transition hover:border-primary-200 hover:bg-primary-50/60"
                >
                  <Icon className="h-5 w-5 text-gray-500 transition group-hover:text-primary-700" />
                  <span className="text-xs font-semibold text-gray-800">
                    <T k={`category.${slug}`} />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="section-title mb-3">
              <T k="home.howItWorks" />
            </h2>
            <ol className="space-y-3">
              {["home.step1", "home.step2", "home.step3"].map((k, i) => (
                <li key={k} className="flex items-start gap-3 text-sm text-gray-600">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-800">
                    <Num n={i + 1} />
                  </span>
                  <span className="pt-0.5">
                    <T k={k} />
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
              <T k="home.trustBadge" />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
