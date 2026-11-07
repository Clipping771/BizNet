import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { getPublicListingById } from "@/lib/repo/listing";
import { VerificationBadge } from "@/components/business/VerificationBadge";
import { Avatar } from "@/components/layout/AccountMenu";
import { T } from "@/components/ui/T";
import { DaysText, MoneyRange, Num } from "@/components/ui/Num";
import { AttributeSchema } from "@/lib/attributes";
import { getSession } from "@/lib/session";
import { logEvent } from "@/lib/events";
import { getPersonalizedRecommendations } from "@/lib/algo/recommendations";

export default async function PublicListingPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const listing = await getPublicListingById(resolvedParams.id);

  // If inactive, deleted, or business suspended: return 404 (D3)
  if (!listing) {
    notFound();
  }

  const session = await getSession();
  if (session.userId || session.activeBusinessId) {
    await logEvent({
      name: "listing_view",
      userId: session.userId ?? null,
      businessId: session.activeBusinessId ?? null,
      props: { listingId: listing.id, categorySlug: listing.category.slug },
    }).catch(() => {});
  }

  const similarListings = await getPersonalizedRecommendations({
    userId: session.userId,
    businessId: session.activeBusinessId,
    categorySlug: listing.category.slug,
    excludeListingIds: [listing.id],
    take: 3,
  }).catch(() => []);

  const attributes = (listing.attributes as Record<string, any>) || {};
  const schema = (listing.category.attributeSchema as unknown as AttributeSchema) || { fields: [] };
  const slug = listing.category.slug;
  const quoteHref = `/requests/new?category=${encodeURIComponent(slug)}&supplier=${encodeURIComponent(listing.business.id)}&supplierName=${encodeURIComponent(listing.business.name)}`;

  return (
    <div className="page-wide space-y-4">
      <Link href={`/b/${listing.business.slug}`} className="link inline-flex items-center gap-1.5 text-[13px]">
        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
        <T k="public.viewBusiness" />
      </Link>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section className="card space-y-4 p-5">
            <div>
              <p className="text-xs font-medium text-slate-500">
                <T k={`category.${slug}`} />
              </p>
              <h1 className="page-title mt-0.5">{listing.title}</h1>
            </div>

            {Array.isArray(listing.imageKeys) && listing.imageKeys.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {listing.imageKeys.map((k: string, i: number) => (
                  <a
                    key={k}
                    href={`/api/files/download?key=${encodeURIComponent(k)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block h-28 w-28 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition hover:opacity-90"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/download?key=${encodeURIComponent(k)}`} alt={`${listing.title} ${i + 1}`} className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}

            {listing.description && <p className="text-sm leading-relaxed text-slate-600">{listing.description}</p>}
          </section>

          {/* Dynamic Specifications & Attributes Table (§6, A1) */}
          {Object.keys(attributes).length > 0 && (
            <section className="card overflow-hidden">
              <h2 className="card-header section-title">
                <T k="public.specifications" />
              </h2>
              <table className="data-table">
                <tbody>
                  {Object.entries(attributes).map(([attrKey, attrVal]) => {
                    const fieldDef = schema.fields.find((f) => f.key === attrKey);
                    let displayVal: React.ReactNode = String(attrVal);
                    if (fieldDef?.type === "select") {
                      displayVal = <T k={`attr.${slug}.${attrKey}.opt.${attrVal}`} />;
                    } else if (fieldDef?.type === "boolean") {
                      displayVal = attrVal ? <T k="common.yes" /> : <T k="common.no" />;
                    } else if (fieldDef?.type === "multiselect" && Array.isArray(attrVal)) {
                      displayVal = (
                        <span className="flex flex-wrap gap-1">
                          {attrVal.map((v) => (
                            <span key={v} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                              <T k={`attr.${slug}.${attrKey}.opt.${v}`} />
                            </span>
                          ))}
                        </span>
                      );
                    }
                    return (
                      <tr key={attrKey}>
                        <td className="w-1/3 text-slate-500">
                          <T k={`attr.${slug}.${attrKey}.label`} />
                          {fieldDef?.unit && <span className="ms-1 text-xs text-slate-500">{fieldDef.unit}</span>}
                        </td>
                        <td className="font-medium text-slate-900">{displayVal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {/* Similar Recommended Products Section (§Algo Retargeting) */}
          {similarListings.length > 0 && (
            <section className="card overflow-hidden">
              <h2 className="card-header section-title">
                <T k="algo.similar" />
              </h2>
              <ul className="divide-y divide-slate-100">
                {similarListings.map((sim) => (
                  <li key={sim.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <Link href={`/l/${sim.id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-primary-700">
                        {sim.title}
                      </Link>
                      <span className="block truncate text-xs text-slate-500">{sim.business.name}</span>
                    </span>
                    {sim.priceMin != null && (
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                        <MoneyRange min={Number(sim.priceMin)} max={sim.priceMax != null ? Number(sim.priceMax) : null} currency={sim.currency} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <section className="card space-y-3 p-5">
            {listing.priceMin != null && (
              <div>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">
                  <MoneyRange min={Number(listing.priceMin)} max={listing.priceMax != null ? Number(listing.priceMax) : null} currency={listing.currency} />
                </p>
                <p className="text-[13px] text-slate-500">{listing.unit}</p>
              </div>
            )}
            <dl className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
              {listing.moq != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500"><T k="public.moqLabel" /></dt>
                  <dd className="font-medium text-slate-900"><Num n={listing.moq} /> {listing.unit}</dd>
                </div>
              )}
              {listing.leadTimeDays != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500"><T k="public.leadTimeLabel" /></dt>
                  <dd className="font-medium text-slate-900"><DaysText n={listing.leadTimeDays} /></dd>
                </div>
              )}
            </dl>
            <Link href={quoteHref} className="btn btn-primary w-full">
              <T k="search.requestQuote" />
            </Link>
          </section>

          <section className="card space-y-2 p-5">
            <p className="eyebrow"><T k="public.supplierInfo" /></p>
            <div className="flex items-center gap-3 pt-1">
              <Avatar name={listing.business.name} size="h-10 w-10 text-sm" />
              <div className="min-w-0">
                <Link href={`/b/${listing.business.slug}`} className="block truncate font-medium text-slate-900 hover:text-primary-700">
                  {listing.business.name}
                </Link>
                <p className="truncate text-xs text-slate-500">{listing.business.businessType}</p>
              </div>
            </div>
            <VerificationBadge status={listing.business.verificationStatus} />
            <p className="flex items-center gap-1.5 text-[13px] text-slate-500">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {[listing.business.area, listing.business.city].filter(Boolean).join(" · ")}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
