import Link from "next/link";
import { SealCheck, ChatsCircle } from "@phosphor-icons/react/dist/ssr";
import { T } from "@/components/ui/T";
import { Money, PercentChange, TNum } from "@/components/ui/Num";
import { Avatar } from "@/components/layout/AccountMenu";
import { HomeActivity } from "@/components/home/HomeActivity";

interface HomeRailProps {
  trends: Array<{ id: string; categorySlug: string; unit: string; median: number; sampleQuotes: number; history: number[] }>;
  suppliers: Array<{ id: string; slug: string; name: string; area: string; businessType: string }>;
  questions: Array<{ id: string; title: string; categorySlug: string | null }>;
}

/** Tiny line of a group's nightly medians; drawn only when there are at least two runs. */
function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  const w = 72;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline points={points} fill="none" stroke={up ? "#059669" : "#E11D48"} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function RailCard({ titleKey, href, children }: { titleKey: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2">
      <div className="flex items-baseline justify-between px-3 pb-1 pt-2">
        <h2 className="text-[15px] font-semibold text-slate-900">
          <T k={titleKey} />
        </h2>
        {href && (
          <Link href={href} className="text-sm font-medium text-primary-600 hover:text-primary-700">
            <T k="common.viewAll" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Right column of the home page: your counts, real market prices, verified suppliers, unanswered questions. */
export function HomeRail({ trends, suppliers, questions }: HomeRailProps) {
  return (
    <aside className="space-y-4">
      <HomeActivity />

      <RailCard titleKey="home.prices.title" href="/prices">
        {trends.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-slate-500">
            <T k="home.prices.empty" />
          </p>
        ) : (
          trends.map((p) => {
            const prev = p.history.length > 1 ? p.history[p.history.length - 2] : null;
            const change = prev ? ((p.median - prev) / prev) * 100 : null;
            return (
              <Link key={p.id} href="/prices" className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    <T k={`category.${p.categorySlug}`} />
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    <Money n={p.median} /> · <T k="home.prices.perUnit" params={{ unit: p.unit }} />
                  </span>
                </span>
                {p.history.length > 1 && change !== null ? (
                  <span className="flex items-center gap-2">
                    <Sparkline values={p.history} up={change >= 0} />
                    <span className={`text-xs font-semibold tabular-nums ${change >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      <PercentChange value={change} />
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">
                    <TNum k="home.quoteCount" n={p.sampleQuotes} />
                  </span>
                )}
              </Link>
            );
          })
        )}
      </RailCard>

      <RailCard titleKey="home.suppliers.title" href="/search">
        {suppliers.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-slate-500">
            <T k="home.suppliers.empty" />
          </p>
        ) : (
          suppliers.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2">
              <Avatar name={s.name} size="h-10 w-10 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                  <span className="truncate">{s.name}</span>
                  <SealCheck size={15} weight="fill" className="shrink-0 text-primary-600" />
                </p>
                <p className="truncate text-xs text-slate-500">{[s.businessType, s.area].filter(Boolean).join(" · ")}</p>
              </div>
              <Link href={`/b/${s.slug}`} className="btn btn-secondary btn-sm shrink-0">
                <T k="home.suppliers.view" />
              </Link>
            </div>
          ))
        )}
      </RailCard>

      <RailCard titleKey="home.rail.questions" href="/q">
        {questions.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-slate-500">
            <T k="home.rail.noQuestions" />
          </p>
        ) : (
          questions.map((q) => (
            <Link key={q.id} href={`/q/${q.id}`} className="flex items-start gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-slate-50">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <ChatsCircle size={18} weight="duotone" />
              </span>
              <span className="line-clamp-2 text-sm text-slate-700">{q.title}</span>
            </Link>
          ))
        )}
      </RailCard>
    </aside>
  );
}
