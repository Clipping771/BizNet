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

/** Request card with incoming quotes, drawn in brand tones (decorative). */
function HeroArt() {
  return (
    <svg viewBox="0 0 220 160" className="hidden h-40 w-56 shrink-0 md:block" aria-hidden="true">
      <rect x="28" y="18" width="120" height="124" rx="14" fill="#fff" />
      <rect x="44" y="38" width="60" height="8" rx="4" fill="#A8DCC5" />
      <rect x="44" y="56" width="88" height="6" rx="3" fill="#E3E5E8" />
      <rect x="44" y="70" width="72" height="6" rx="3" fill="#E3E5E8" />
      <rect x="44" y="84" width="80" height="6" rx="3" fill="#E3E5E8" />
      <rect x="44" y="108" width="56" height="18" rx="9" fill="#006A4E" />
      <g>
        <rect x="118" y="46" width="88" height="34" rx="12" fill="#fff" stroke="#D3EEE2" />
        <circle cx="136" cy="63" r="8" fill="#1A73E8" />
        <rect x="150" y="57" width="40" height="5" rx="2.5" fill="#C7CBD1" />
        <rect x="150" y="66" width="26" height="5" rx="2.5" fill="#0B8261" />
      </g>
      <g>
        <rect x="132" y="92" width="80" height="34" rx="12" fill="#fff" stroke="#D3EEE2" />
        <circle cx="150" cy="109" r="8" fill="#E8710A" />
        <rect x="164" y="103" width="36" height="5" rx="2.5" fill="#C7CBD1" />
        <rect x="164" y="112" width="22" height="5" rx="2.5" fill="#0B8261" />
      </g>
    </svg>
  );
}

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
    <div className="page-wide space-y-6 animate-fade-up pt-2">
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
      <section className="relative overflow-hidden rounded-[28px] bg-primary-50 px-6 py-7 sm:px-10 sm:py-9">
        <div className="relative flex items-center justify-between gap-8">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-primary-800">
              <Sparkles className="h-3.5 w-3.5" />
              <T k="home.aiBadge" />
            </span>
            <h2 className="mt-4 text-[22px] font-semibold leading-snug tracking-[-0.01em] text-gray-900 sm:text-[28px]">
              <T k="home.aiTitle" />
            </h2>
            <p className="mt-2 text-[15px] text-gray-600">
              <T k="home.aiSubtitle" />
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/requests/new" className="btn btn-primary btn-lg">
                <Plus className="h-5 w-5" />
                <T k="home.newRequest" />
              </Link>
              <Link href="/requests/new" aria-label="voice" className="btn btn-secondary btn-lg hidden w-12 bg-white px-0 sm:inline-flex">
                <Mic className="h-5 w-5" />
              </Link>
            </div>
          </div>
          <HeroArt />
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
