import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartLineUp, ChatCircleDots, CheckCircle, ClipboardText, FileText, MagnifyingGlass, Package, Plus, Scales, SealCheck, Storefront, Warning } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { T } from "@/components/ui/T";
import { Num, Money, TNum } from "@/components/ui/Num";
import { DateText } from "@/components/ui/TimeAgo";
import { StatusChip } from "@/components/ui/ListStates";
import { ORDER_STATUS_TONE, REQUEST_STATUS_TONE } from "@/lib/status-tones";
import { Recommended } from "@/components/home/Recommended";
import { OrderAgain } from "@/components/home/OrderAgain";
import { InstantAnswer } from "@/components/instant/InstantAnswer";
import { getSession } from "@/lib/session";
import { findBusinessById } from "@/lib/repo/business";
import { deskData, listMyRecentRequests, listOrderAgain, priceTrends } from "@/lib/repo/home";
import { listInboxRequestsForSupplier } from "@/lib/repo/request";
import { getPersonalizedRecommendations } from "@/lib/algo/recommendations";

interface Task {
  key: string;
  icon: Icon;
  urgent?: boolean;
  labelKey: string;
  n?: number;
  title?: string;
  href: string;
  actKey: string;
}

const ACTIVE_ORDER_TASK: Record<string, { supplier?: { k: string; urgent?: boolean }; buyer?: { k: string; urgent?: boolean } }> = {
  CONFIRMED: { supplier: { k: "desk.task.dispatch" } },
  DISPATCHED: { supplier: { k: "desk.task.markDelivered" } },
  DELIVERED: { buyer: { k: "desk.task.receive" } },
  DISPUTED: { supplier: { k: "desk.task.dispute", urgent: true }, buyer: { k: "desk.task.dispute", urgent: true } },
};

function Stat({ id, labelKey, value, href, icon: StatIcon, tile }: { id?: string; labelKey: string; value: number; href: string; icon: Icon; tile: string }) {
  return (
    <Link id={id} href={href} className="card card-link group relative overflow-hidden p-4 sm:p-5">
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-[13px] font-medium leading-snug text-slate-500">
          <T k={labelKey} />
        </span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${tile}`}>
          <StatIcon size={18} weight="duotone" />
        </span>
      </span>
      <span className="mt-3 block text-3xl font-bold leading-none tabular-nums tracking-tight text-slate-900">
        <Num n={value} />
      </span>
    </Link>
  );
}

/** The desk: what waits on this business first, then its requests and orders, with market context alongside. */
export default async function HomePage() {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");
  const business = session.activeBusinessId ? await findBusinessById(session.activeBusinessId).catch(() => null) : null;

  if (!business) {
    return (
      <div className="page">
        <div className="card flex flex-col items-start gap-3 p-6">
          <p className="text-[15px] text-slate-700">
            <T k="desk.noBusiness" />
          </p>
          <Link href="/onboarding" className="btn btn-primary">
            <T k="desk.noBusiness.cta" />
          </Link>
        </div>
      </div>
    );
  }

  const canSell = business.verificationStatus === "BASIC" || business.verificationStatus === "VERIFIED";
  const [desk, requests, opportunities, trends, recommendations, orderAgain] = await Promise.all([
    deskData(business.id),
    business.isBuyer !== false ? listMyRecentRequests(business.id).catch(() => []) : [],
    business.isSupplier ? listInboxRequestsForSupplier(business.id).catch(() => []) : [],
    priceTrends(4).catch(() => []),
    getPersonalizedRecommendations({
      userId: session.userId,
      businessId: business.id,
      buyerArea: business.area,
      buyerCity: business.city,
      take: 3,
    }).catch(() => []),
    business.isBuyer !== false ? listOrderAgain(business.id).catch(() => []) : [],
  ]);

  const tasks: Task[] = [];
  if (business.isSupplier && !canSell) {
    tasks.push({ key: "verify", icon: SealCheck, urgent: true, labelKey: "desk.task.verify", href: "/business/verification", actKey: "desk.act.verify" });
  }
  for (const o of desk.orders) {
    const isBuyer = o.buyerBusinessId === business.id;
    const needsMyConfirmation = o.status === "PENDING_CONFIRMATION" && (isBuyer ? !o.buyerConfirmedAt : !o.supplierConfirmedAt);
    const task = needsMyConfirmation ? { k: "desk.task.confirmOrder", urgent: true } : ACTIVE_ORDER_TASK[o.status]?.[isBuyer ? "buyer" : "supplier"];
    if (task) {
      tasks.push({ key: `order-${o.code}`, icon: task.urgent ? Warning : Package, urgent: task.urgent, labelKey: task.k, title: o.request.title, href: `/orders/${o.code}`, actKey: "desk.act.open" });
    }
  }
  for (const r of desk.quotesToCompare) {
    tasks.push({ key: `cmp-${r.code}`, icon: Scales, labelKey: "desk.task.compare", n: r._count.quotes, title: r.title, href: `/requests/${r.code}`, actKey: "desk.act.compare" });
  }
  for (const r of opportunities.filter((x) => !x.quotes[0]).slice(0, 5)) {
    tasks.push({ key: `quote-${r.code}`, icon: ClipboardText, labelKey: "desk.task.quote", title: r.title, href: `/requests/${r.code}`, actKey: "desk.act.quote" });
  }
  if (desk.unreadMessages > 0) {
    tasks.push({ key: "unread", icon: ChatCircleDots, labelKey: "desk.task.unread", n: desk.unreadMessages, href: "/inbox", actKey: "desk.act.reply" });
  }
  tasks.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));

  const activeOrders = desk.orders.slice(0, 5);

  return (
    <div className="page-wide space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <span className="truncate">{business.name}</span>
            {canSell && <SealCheck size={16} weight="fill" className="shrink-0 text-primary-600" />}
          </p>
          <h1 className="page-title mt-1">
            <T k="desk.welcome" />
          </h1>
        </div>
        <div className="hidden shrink-0 gap-2 sm:flex">
          {business.isSupplier ? (
            <Link href="/business/listings/new" className="btn btn-secondary">
              <Storefront size={16} weight="bold" />
              <T k="desk.quick.listing" />
            </Link>
          ) : (
            <Link href="/prices" className="btn btn-secondary">
              <ChartLineUp size={16} weight="bold" />
              <T k="nav.prices" />
            </Link>
          )}
          <Link href="/requests/new" className="btn btn-primary">
            <Plus size={16} weight="bold" />
            <T k="home.newRequest" />
          </Link>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-3xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-sky-50 p-4 sm:p-6">
        <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div aria-hidden="true" className="pointer-events-none absolute -end-20 -top-24 h-64 w-64 rounded-full bg-primary-200/50 blur-3xl" />
        <div className="relative max-w-3xl">
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            <T k="desk.hero.title" />
          </h2>
          <InstantAnswer />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat id="home-open-requests" labelKey="desk.stat.openRequests" value={desk.openRequests} href="/requests" icon={FileText} tile="bg-sky-50 text-sky-600 ring-sky-100" />
        <Stat labelKey="desk.stat.quotes" value={desk.quotesReceived} href="/requests" icon={Scales} tile="bg-violet-50 text-violet-600 ring-violet-100" />
        <Stat labelKey="desk.stat.orders" value={desk.orders.length} href="/orders" icon={Package} tile="bg-emerald-50 text-emerald-600 ring-emerald-100" />
        <Stat labelKey="desk.stat.unread" value={desk.unreadMessages} href="/inbox" icon={ChatCircleDots} tile="bg-amber-50 text-amber-600 ring-amber-100" />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <section className="card" id="desk-tasks">
          <div className="card-header">
            <h2 className="section-title">
              <T k="desk.needsYou" />
            </h2>
            {tasks.length > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-100 px-2 text-xs font-bold tabular-nums text-amber-800">
                <Num n={tasks.length} />
              </span>
            )}
          </div>
          {tasks.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
              <CheckCircle size={18} weight="fill" className="text-emerald-600" />
              <T k="desk.allClear" />
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tasks.slice(0, 8).map(({ key, icon: TaskIcon, urgent, labelKey, n, title, href, actKey }) => (
                <li key={key} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/70 sm:px-5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${urgent ? "bg-amber-50 text-amber-600 ring-amber-100" : "bg-primary-50 text-primary-600 ring-primary-100"}`}>
                    <TaskIcon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {n !== undefined ? <TNum k={labelKey} n={n} /> : <T k={labelKey} />}
                    </span>
                    {title && <span className="block truncate text-xs text-slate-500">{title}</span>}
                  </span>
                  <Link href={href} className="btn btn-secondary btn-sm shrink-0">
                    <T k={actKey} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {orderAgain.length > 0 && <OrderAgain items={orderAgain} />}

        {business.isBuyer !== false && (
          <section className="card overflow-hidden">
            <div className="card-header">
              <h2 className="section-title">
                <T k="desk.requests.title" />
              </h2>
              <Link href="/requests" className="link text-[13px]">
                <T k="common.viewAll" />
              </Link>
            </div>
            {requests.length === 0 ? (
              <div className="flex flex-col items-start gap-3 px-4 py-6">
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <FileText size={18} />
                  <T k="desk.requests.empty" />
                </p>
                <Link href="/requests/new" className="btn btn-primary btn-sm">
                  <T k="home.newRequest" />
                </Link>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table table-stack">
                  <thead>
                    <tr>
                      <th><T k="desk.col.request" /></th>
                      <th className="hidden sm:table-cell"><T k="desk.col.quantity" /></th>
                      <th><T k="desk.col.quotes" /></th>
                      <th><T k="desk.col.status" /></th>
                      <th className="hidden md:table-cell"><T k="desk.col.date" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.code}>
                        <td className="max-w-[16rem]">
                          <Link href={`/requests/${r.code}`} className="block truncate font-medium text-slate-900 hover:text-primary-700">
                            {r.title}
                          </Link>
                        </td>
                        <td className="hidden whitespace-nowrap sm:table-cell">
                          <Num n={Number(r.quantity)} /> {r.unit}
                        </td>
                        <td>
                          <span className="sm:hidden"><TNum k="desk.quotesShort" n={r._count.quotes} /></span>
                          <span className="hidden sm:inline"><Num n={r._count.quotes} /></span>
                        </td>
                        <td><StatusChip k={`reqStatus.${r.status}`} tone={REQUEST_STATUS_TONE[r.status] ?? "gray"} /></td>
                        <td className="hidden whitespace-nowrap text-slate-500 md:table-cell"><DateText iso={r.createdAt.toISOString()} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <section className="card overflow-hidden">
          <div className="card-header">
            <h2 className="section-title">
              <T k="desk.orders.title" />
            </h2>
            <Link href="/orders" className="link text-[13px]">
              <T k="common.viewAll" />
            </Link>
          </div>
          {activeOrders.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
              <Package size={18} />
              <T k="desk.orders.empty" />
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table table-stack">
                <thead>
                  <tr>
                    <th><T k="desk.col.order" /></th>
                    <th className="hidden sm:table-cell"><T k="desk.col.party" /></th>
                    <th><T k="desk.col.status" /></th>
                  </tr>
                </thead>
                <tbody>
                  {activeOrders.map((o) => (
                    <tr key={o.code}>
                      <td className="max-w-[18rem]">
                        <Link href={`/orders/${o.code}`} className="block truncate font-medium text-slate-900 hover:text-primary-700">
                          {o.request.title}
                        </Link>
                        <span className="text-xs text-slate-500">{o.code}</span>
                      </td>
                      <td className="hidden sm:table-cell">{o.buyerBusinessId === business.id ? o.supplierBusiness.name : o.buyerBusiness.name}</td>
                      <td><StatusChip k={`order.status.${o.status}`} tone={ORDER_STATUS_TONE[o.status] ?? "gray"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <aside className="grid min-w-0 grid-cols-1 items-start gap-5 md:grid-cols-2 lg:sticky lg:top-20 lg:grid-cols-1">
        <section className="card">
          <div className="card-header">
            <h2 className="section-title">
              <T k="home.prices.title" />
            </h2>
            <Link href="/prices" className="link text-[13px]">
              <T k="common.viewAll" />
            </Link>
          </div>
          {trends.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">
              <T k="home.prices.empty" />
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {trends.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-800">
                      <T k={`category.${p.categorySlug}`} />
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      <TNum k="home.quoteCount" n={p.sampleQuotes} />
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="block text-sm font-semibold tabular-nums text-slate-900">
                      <Money n={p.median} currency={p.currency} />
                    </span>
                    <span className="block text-xs text-slate-500">
                      <T k="home.prices.perUnit" params={{ unit: p.unit }} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Recommended
          items={recommendations.map((l) => ({
            id: l.id,
            title: l.title,
            supplier: l.business.name,
            categorySlug: l.category.slug,
            priceMin: l.priceMin ? Number(l.priceMin) : null,
            priceMax: l.priceMax ? Number(l.priceMax) : null,
            currency: l.currency,
            reasonKey: l.reasonKey,
            reasonParam: l.reasonParam,
          }))}
        />
      </aside>
      </div>
    </div>
  );
}
