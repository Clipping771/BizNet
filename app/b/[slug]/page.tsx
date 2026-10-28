import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Building, Package, Shield, ExternalLink } from "lucide-react";
import { getPublicBusinessBySlug } from "@/lib/repo/listing";
import { VerificationBadge } from "@/components/business/VerificationBadge";
import { T } from "@/components/ui/T";

export default async function PublicBusinessProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const business = await getPublicBusinessBySlug(resolvedParams.slug);

  // If business not found or is suspended/deleted, return 404 (D3 requirement)
  if (!business) {
    notFound();
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      {/* Business Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full inline-block">
              {business.businessType}
            </span>
            <h1 className="page-title">{business.name}</h1>
          </div>
          <VerificationBadge status={business.verificationStatus} />
        </div>

        {business.description && (
          <p className="text-xs text-slate-600 leading-relaxed pt-1">
            {business.description}
          </p>
        )}

        <div className="flex items-center gap-1.5 text-xs text-slate-400 pt-2 border-t border-slate-100">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{business.area}</span>
          <span>{" · "}</span>
          <span>{business.city}</span>
        </div>

        {/* Contact Protection Notice (§10, D1) */}
        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-500 flex items-center gap-2">
          <Shield className="w-4 h-4 text-slate-400 shrink-0" />
          <span>
            <T k="public.contactNotice" />
          </span>
        </div>
      </div>

      {/* Listings Section */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Package className="w-4 h-4 text-emerald-600" />
          <T k="public.listings" />
        </h2>

        {business.listings.length === 0 ? (
          <div className="bg-white p-6 rounded-2xl border border-slate-100 text-center text-xs text-slate-400">
            <T k="public.noListings" />
          </div>
        ) : (
          <div className="space-y-3">
            {business.listings.map((l) => (
              <Link
                key={l.id}
                href={`/l/${l.id}`}
                className="block bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:border-emerald-200 transition space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md inline-block">
                      <T k={`category.${l.category.slug}`} />
                    </span>
                    <h3 className="text-sm font-bold text-slate-900">{l.title}</h3>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
                </div>

                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span>
                    {l.priceMin || l.priceMax ? (
                      <>
                        <span>{l.priceMin ? String(l.priceMin) : ""}</span>
                        <span>{" / "}</span>
                        <span>{l.priceMax ? String(l.priceMax) : ""}</span>
                        <span>{" · "}</span>
                        <span>{l.unit}</span>
                      </>
                    ) : (
                      <span>{l.unit}</span>
                    )}
                  </span>
                  {l.moq && (
                    <>
                      <span>{" · "}</span>
                      <span>
                        <T k="public.moqLabel" />
                      </span>
                      <span>{" "}</span>
                      <span>{l.moq}</span>
                    </>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
