import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle, MapPin, Shield } from "lucide-react";
import { getTrustSignals } from "@/lib/repo/trust";
import { getPublicBusinessBySlug } from "@/lib/repo/listing";
import { VerificationBadge } from "@/components/business/VerificationBadge";
import { Avatar } from "@/components/layout/AccountMenu";
import { MoneyRange, Num, TNumTotal } from "@/components/ui/Num";
import { T } from "@/components/ui/T";

export default async function PublicBusinessProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const business = await getPublicBusinessBySlug(resolvedParams.slug);

  // If business not found or is suspended/deleted, return 404 (D3 requirement)
  if (!business) {
    notFound();
  }

  const signals = await getTrustSignals(business.id);
  const quoteHref = `/requests/new?supplier=${encodeURIComponent(business.id)}&supplierName=${encodeURIComponent(business.name)}`;

  return (
    <div className="page-wide grid grid-cols-1 items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="card space-y-4 p-5 lg:sticky lg:top-20">
        <div className="flex items-center gap-3">
          <Avatar name={business.name} size="h-12 w-12 text-base" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight text-slate-900">{business.name}</h1>
            <p className="truncate text-[13px] text-slate-500">{business.businessType}</p>
          </div>
        </div>
        <VerificationBadge status={business.verificationStatus} />
        {signals.length > 0 && (
          <ul id="trust-signals" className="space-y-1 text-[13px] text-slate-700">
            {signals.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <CheckCircle className={`h-3.5 w-3.5 shrink-0 ${s.key === "trust.openDisputes" ? "text-amber-600" : "text-emerald-600"}`} />
                <TNumTotal k={s.key} n={s.n ?? 0} total={s.total ?? 0} />
              </li>
            ))}
          </ul>
        )}
        {business.description && <p className="text-sm leading-relaxed text-slate-600">{business.description}</p>}
        <p className="flex items-center gap-1.5 text-[13px] text-slate-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {[business.area, business.city].filter(Boolean).join(" · ")}
        </p>
        {business.isSupplier && (
          <Link href={quoteHref} className="btn btn-primary w-full">
            <T k="search.requestQuote" />
          </Link>
        )}
        {/* Contact Protection Notice (§10, D1) */}
        <p className="flex items-start gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <T k="public.contactNotice" />
        </p>
      </aside>

      <section className="card overflow-hidden">
        <h2 className="card-header section-title">
          <T k="public.listings" />
        </h2>
        {business.listings.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            <T k="public.noListings" />
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th><T k="listing.titleField" /></th>
                  <th className="hidden sm:table-cell"><T k="listing.category" /></th>
                  <th className="text-end"><T k="home.stat.price" /></th>
                  <th className="hidden text-end sm:table-cell"><T k="public.moqLabel" /></th>
                </tr>
              </thead>
              <tbody>
                {business.listings.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/l/${l.id}`} className="font-medium text-slate-900 hover:text-primary-700">
                        {l.title}
                      </Link>
                    </td>
                    <td className="hidden sm:table-cell"><T k={`category.${l.category.slug}`} /></td>
                    <td className="whitespace-nowrap text-end font-medium text-slate-900">
                      {l.priceMin ? <MoneyRange min={Number(l.priceMin)} max={l.priceMax ? Number(l.priceMax) : null} currency={l.currency} /> : "—"}
                      <span className="ms-1 text-xs font-normal text-slate-500">{l.unit}</span>
                    </td>
                    <td className="hidden whitespace-nowrap text-end sm:table-cell">{l.moq ? <Num n={l.moq} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
