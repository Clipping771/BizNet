import Link from "next/link";
import { ChartLineUp, ChatsCircle, FileText, MagnifyingGlass, Question } from "@phosphor-icons/react/dist/ssr";
import { T } from "@/components/ui/T";
import { Num, MoneyRange, DaysText } from "@/components/ui/Num";
import { DateText } from "@/components/ui/TimeAgo";
import { StatusChip, REQUEST_STATUS_TONE } from "@/components/ui/ListStates";
import { Avatar } from "@/components/layout/AccountMenu";
import { FeedCard } from "@/components/home/FeedCard";
import { HomeRail } from "@/components/home/HomeRail";
import { getSession } from "@/lib/session";
import { findBusinessById } from "@/lib/repo/business";
import { getTopVerifiedSuppliers, listMyRecentRequests, listRecentPublicListings, priceTrends } from "@/lib/repo/home";
import { listInboxRequestsForSupplier } from "@/lib/repo/request";
import { listQuestions } from "@/lib/repo/discussion";
import { getPersonalizedRecommendations } from "@/lib/algo/recommendations";

type FeedItem = { at: Date; node: React.ReactNode };

/** Newest first within each kind, then one of each kind in turn so no single kind fills the feed. */
function interleave(groups: FeedItem[][]): FeedItem[] {
  const queues = groups.map((g) => [...g].sort((a, b) => b.at.getTime() - a.at.getTime()));
  const out: FeedItem[] = [];
  while (queues.some((q) => q.length > 0)) for (const q of queues) if (q.length) out.push(q.shift()!);
  return out;
}

const COMPOSER_ACTIONS = [
  { href: "/requests/new", icon: FileText, k: "home.composer.request", tone: "text-teal-700" },
  { href: "/q/new", icon: Question, k: "home.composer.ask", tone: "text-amber-600" },
  { href: "/search", icon: MagnifyingGlass, k: "home.composer.suppliers", tone: "text-slate-600" },
  { href: "/prices", icon: ChartLineUp, k: "home.composer.prices", tone: "text-emerald-600" },
];

/** Home feed: real trade requests, new products and community questions, with the rail on the right. */
export default async function HomePage() {
  const session = await getSession();
  const business = session.activeBusinessId ? await findBusinessById(session.activeBusinessId).catch(() => null) : null;
  const viewer = { userId: session.userId ?? null, isAdmin: session.role === "ADMIN" };

  const [opportunities, myRequests, listings, questions, trends, suppliers, recommendations] = await Promise.all([
    business?.isSupplier ? listInboxRequestsForSupplier(business.id).catch(() => []) : [],
    business && business.isBuyer !== false ? listMyRecentRequests(business.id).catch(() => []) : [],
    listRecentPublicListings(6).catch(() => []),
    listQuestions({ viewer }).catch(() => []),
    priceTrends(4).catch(() => []),
    getTopVerifiedSuppliers(3).catch(() => []),
    getPersonalizedRecommendations({
      userId: session.userId,
      businessId: business?.id,
      buyerArea: business?.area,
      buyerCity: business?.city,
      take: 4,
    }).catch(() => []),
  ]);

  const recommendedItems: FeedItem[] = [];
  const requestItems: FeedItem[] = [];
  const mineItems: FeedItem[] = [];
  const listingItems: FeedItem[] = [];
  const questionItems: FeedItem[] = [];

  for (const r of opportunities.slice(0, 5)) {
    const mine = r.quotes[0];
    requestItems.push({
      at: r.createdAt,
      node: (
        <FeedCard
          key={`req-${r.id}`}
          id={`feed-request-${r.code}`}
          lead={<Avatar name={r.buyerBusiness.name} size="h-12 w-12 text-base" />}
          name={r.buyerBusiness.name}
          verified={r.buyerBusiness.verificationStatus === "VERIFIED" || r.buyerBusiness.verificationStatus === "BASIC"}
          kindKey="home.feed.request"
          kindTone="bg-teal-50 text-teal-800 border border-teal-200/80"
          meta={[r.buyerBusiness.businessType, r.deliveryArea].filter(Boolean).join(" · ")}
          at={r.createdAt.toISOString()}
          title={r.title}
          titleHref={`/requests/${r.code}`}
          stats={[
            { labelKey: "home.stat.quantity", value: <><Num n={Number(r.quantity)} /> {r.unit}</> },
            { labelKey: "home.stat.neededBy", value: r.neededBy ? <DateText iso={r.neededBy.toISOString()} /> : null },
            { labelKey: "home.stat.category", value: <T k={`category.${r.category.slug}`} /> },
          ]}
          actions={
            mine
              ? [{ href: `/requests/${r.code}`, labelKey: "home.act.youQuoted" }]
              : [
                  { href: `/requests/${r.code}`, labelKey: "home.act.sendQuote", primary: true },
                  { href: `/requests/${r.code}`, labelKey: "home.act.viewDetails" },
                ]
          }
        />
      ),
    });
  }

  for (const r of myRequests) {
    mineItems.push({
      at: r.createdAt,
      node: (
        <FeedCard
          key={`mine-${r.code}`}
          lead={
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <FileText size={24} weight="duotone" />
            </span>
          }
          name={business?.name ?? ""}
          kindKey="home.feed.myRequest"
          kindTone="bg-slate-100 text-slate-700"
          at={r.createdAt.toISOString()}
          title={r.title}
          titleHref={`/requests/${r.code}`}
          stats={[
            { labelKey: "home.stat.quotes", value: <Num n={r._count.quotes} /> },
            { labelKey: "home.stat.quantity", value: <><Num n={Number(r.quantity)} /> {r.unit}</> },
            { labelKey: "home.stat.status", value: <StatusChip k={`reqStatus.${r.status}`} tone={REQUEST_STATUS_TONE[r.status] ?? "gray"} /> },
          ]}
          actions={[
            ...(r._count.quotes > 0 ? [{ href: `/requests/${r.code}`, labelKey: "home.act.compareQuotes", primary: true }] : []),
            { href: `/requests/${r.code}`, labelKey: "home.act.viewDetails" },
          ]}
        />
      ),
    });
  }

  for (const l of listings) {
    const image = Array.isArray(l.imageKeys) && l.imageKeys.length > 0 ? l.imageKeys[0] : null;
    listingItems.push({
      at: l.createdAt,
      node: (
        <FeedCard
          key={`listing-${l.id}`}
          lead={<Avatar name={l.business.name} size="h-12 w-12 text-base" />}
          name={l.business.name}
          nameHref={`/b/${l.business.slug}`}
          verified={l.business.verificationStatus === "VERIFIED" || l.business.verificationStatus === "BASIC"}
          kindKey="home.feed.product"
          kindTone="bg-emerald-50 text-emerald-700 border border-emerald-200/80"
          meta={[l.business.businessType, l.business.area].filter(Boolean).join(" · ")}
          at={l.createdAt.toISOString()}
          title={l.title}
          titleHref={`/l/${l.id}`}
          media={
            image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/download?key=${encodeURIComponent(image)}`} alt="" className="aspect-[16/7] w-full rounded-xl object-cover" loading="lazy" />
            ) : undefined
          }
          stats={[
            {
              labelKey: "home.stat.price",
              value: l.priceMin ? <MoneyRange min={Number(l.priceMin)} max={l.priceMax ? Number(l.priceMax) : null} currency={l.currency} /> : null,
            },
            { labelKey: "home.stat.moq", value: l.moq ? <><Num n={l.moq} /> {l.unit}</> : null },
            { labelKey: "home.stat.leadTime", value: l.leadTimeDays ? <DaysText n={l.leadTimeDays} /> : null },
          ]}
          actions={[
            { href: `/requests/new?category=${l.category.slug}&supplier=${l.business.id}`, labelKey: "home.act.requestQuote", primary: true },
            { href: `/l/${l.id}`, labelKey: "home.act.viewProduct" },
            { href: `/b/${l.business.slug}`, labelKey: "home.act.visitProfile" },
          ]}
        />
      ),
    });
  }

  for (const q of questions.slice(0, 5)) {
    const author = q.authorBusiness?.name ?? q.authorName;
    questionItems.push({
      at: q.createdAt,
      node: (
        <FeedCard
          key={`q-${q.id}`}
          lead={
            author ? (
              <Avatar name={author} size="h-12 w-12 text-base" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <ChatsCircle size={24} weight="duotone" />
              </span>
            )
          }
          name={author ?? <T k="home.feed.anonymous" />}
          nameHref={q.authorBusiness ? `/b/${q.authorBusiness.slug}` : undefined}
          kindKey="home.feed.question"
          kindTone="bg-amber-50 text-amber-800 border border-amber-200/80"
          meta={q.categorySlug ? <T k={`category.${q.categorySlug}`} /> : undefined}
          at={q.createdAt.toISOString()}
          title={q.title}
          titleHref={`/q/${q.id}`}
          stats={[
            { labelKey: "home.stat.answers", value: <Num n={q.answerCount} /> },
            { labelKey: "home.stat.votes", value: <Num n={q.score} /> },
          ]}
          actions={[
            { href: `/q/${q.id}`, labelKey: "home.act.answer", primary: q.answerCount === 0 },
            { href: `/q/${q.id}`, labelKey: "home.act.viewDiscussion" },
          ]}
        />
      ),
    });
  }

  for (const l of recommendations) {
    const image = Array.isArray(l.imageKeys) && l.imageKeys.length > 0 ? l.imageKeys[0] : null;
    recommendedItems.push({
      at: l.createdAt,
      node: (
        <FeedCard
          key={`rec-${l.id}`}
          id={`feed-rec-${l.id}`}
          lead={<Avatar name={l.business.name} size="h-12 w-12 text-base" />}
          name={l.business.name}
          nameHref={`/b/${l.business.slug}`}
          verified={l.business.verificationStatus === "VERIFIED" || l.business.verificationStatus === "BASIC"}
          kindKey="home.feed.product"
          kindTone="bg-emerald-50 text-emerald-700 border border-emerald-200/80"
          meta={[l.business.businessType, l.business.area].filter(Boolean).join(" · ")}
          at={l.createdAt.toISOString()}
          title={l.title}
          titleHref={`/l/${l.id}`}
          listingId={l.id}
          categorySlug={l.category.slug}
          isRecommended={true}
          recommendationReasonKey={l.reasonKey}
          recommendationReasonParam={l.reasonParam}
          media={
            image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/download?key=${encodeURIComponent(image)}`} alt="" className="aspect-[16/7] w-full rounded-xl object-cover" loading="lazy" />
            ) : undefined
          }
          stats={[
            {
              labelKey: "home.stat.price",
              value: l.priceMin ? <MoneyRange min={Number(l.priceMin)} max={l.priceMax ? Number(l.priceMax) : null} currency={l.currency} /> : null,
            },
            { labelKey: "home.stat.moq", value: l.moq ? <><Num n={l.moq} /> {l.unit}</> : null },
            { labelKey: "home.stat.leadTime", value: l.leadTimeDays ? <DaysText n={l.leadTimeDays} /> : null },
          ]}
          actions={[
            { href: `/requests/new?category=${l.category.slug}&supplier=${l.business.id}`, labelKey: "home.act.requestQuote", primary: true },
            { href: `/l/${l.id}`, labelKey: "home.act.viewProduct" },
            { href: `/b/${l.business.slug}`, labelKey: "home.act.visitProfile" },
          ]}
        />
      ),
    });
  }

  const items = interleave([recommendedItems, requestItems, mineItems, listingItems, questionItems]);
  const unanswered = questions.filter((q) => q.answerCount === 0).slice(0, 3);

  return (
    <div className="mx-auto grid max-w-[1080px] grid-cols-1 items-start gap-6 pt-2 lg:grid-cols-[minmax(0,1fr)_320px] lg:pt-4">
      <div className="min-w-0 space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 px-4 pt-4">
            <Avatar name={business?.name || "B"} size="h-12 w-12 text-base" />
            <Link
              href="/requests/new"
              id="feed-create-rfq-trigger"
              className="flex h-12 min-w-0 flex-1 items-center rounded-full border border-slate-300 px-5 text-[15px] text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              <span className="truncate">
                <T k="home.composer.start" />
              </span>
            </Link>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 border-t border-slate-100 p-2 sm:grid-cols-4">
            {COMPOSER_ACTIONS.map(({ href, icon: Icon, k, tone }) => (
              <Link key={k} href={href} className="flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
                <Icon size={20} weight="duotone" className={tone} />
                <T k={k} />
              </Link>
            ))}
          </div>
        </section>

        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-[15px] text-slate-500">
            <T k="home.feed.empty" />
          </p>
        ) : (
          items.slice(0, 12).map((i) => i.node)
        )}
      </div>

      <div className="lg:sticky lg:top-20">
        <HomeRail
          trends={trends}
          suppliers={suppliers}
          questions={unanswered.map((q) => ({ id: q.id, title: q.title, categorySlug: q.categorySlug }))}
        />
      </div>
    </div>
  );
}
