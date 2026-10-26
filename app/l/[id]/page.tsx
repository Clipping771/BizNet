import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Package, Building2, MapPin, Clock, Layers, ArrowLeft } from "lucide-react";
import { getPublicListingById } from "@/lib/repo/listing";
import { VerificationBadge } from "@/components/business/VerificationBadge";
import { T } from "@/components/ui/T";
import { AttributeSchema } from "@/lib/attributes";

export default async function PublicListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const listing = await getPublicListingById(resolvedParams.id);

  // If inactive, deleted, or business suspended: return 404 (D3)
  if (!listing) {
    notFound();
  }

  const attributes = (listing.attributes as Record<string, any>) || {};
  const schema = (listing.category.attributeSchema as unknown as AttributeSchema) || { fields: [] };

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      {/* Top back navigation */}
      <div>
        <Link
          href={`/b/${listing.business.slug}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>
            <T k="public.viewBusiness" />
          </span>
        </Link>
      </div>

      {/* Main Listing Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full inline-block">
            <T k={`category.${listing.category.slug}`} />
          </span>
          <h1 className="text-xl font-bold text-slate-900 leading-snug">{listing.title}</h1>
        </div>

        {/* Pricing & Commercial Terms */}
        <div className="p-3.5 bg-slate-50 rounded-xl space-y-1.5">
          <span className="text-[11px] text-slate-500 block">
            <T k="public.priceRange" />
          </span>
          <div className="text-lg font-bold text-slate-900 flex items-center gap-1">
            {listing.priceMin || listing.priceMax ? (
              <>
                <span>{listing.priceMin ? String(listing.priceMin) : ""}</span>
                <span>{" / "}</span>
                <span>{listing.priceMax ? String(listing.priceMax) : ""}</span>
                <span>{" · "}</span>
                <span>{listing.unit}</span>
              </>
            ) : (
              <span>{listing.unit}</span>
            )}
          </div>

          <div className="pt-2 flex items-center gap-4 text-xs text-slate-600 border-t border-slate-200/60">
            {listing.moq && (
              <div className="flex items-center gap-1">
                <span className="text-slate-400">
                  <T k="public.moqLabel" />
                  <span>{" · "}</span>
                </span>
                <span className="font-semibold text-slate-800">{listing.moq}</span>
                <span>{" "}</span>
                <span>{listing.unit}</span>
              </div>
            )}
            {listing.leadTimeDays && (
              <div className="flex items-center gap-1">
                <span className="text-slate-400">
                  <T k="public.leadTimeLabel" />
                  <span>{" · "}</span>
                </span>
                <span className="font-semibold text-slate-800">{listing.leadTimeDays}</span>
                <span>{" "}</span>
                <span>
                  <T k="public.days" />
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {listing.description && (
          <div className="space-y-1 text-xs text-slate-600 leading-relaxed pt-1">
            <span className="font-semibold text-slate-900 block">
              <T k="listing.description" />
            </span>
            <p>{listing.description}</p>
          </div>
        )}

        {/* Dynamic Specifications & Attributes Table (§6, A1) */}
        {Object.keys(attributes).length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-600" />
              <T k="public.specifications" />
            </span>

            <div className="rounded-xl border border-slate-100 overflow-hidden text-xs">
              <table className="w-full text-left divide-y divide-slate-100">
                <tbody className="divide-y divide-slate-100 bg-white">
                  {Object.entries(attributes).map(([attrKey, attrVal]) => {
                    const fieldDef = schema.fields.find((f) => f.key === attrKey);
                    const labelKey = `attr.${listing.category.slug}.${attrKey}.label`;

                    let displayVal: React.ReactNode = String(attrVal);
                    if (fieldDef?.type === "select") {
                      displayVal = <T k={`attr.${listing.category.slug}.${attrKey}.opt.${attrVal}`} />;
                    } else if (fieldDef?.type === "boolean") {
                      displayVal = attrVal ? <T k="common.yes" /> : <T k="common.no" />;
                    } else if (fieldDef?.type === "multiselect" && Array.isArray(attrVal)) {
                      displayVal = (
                        <div className="flex flex-wrap gap-1">
                          {attrVal.map((v) => (
                            <span key={v} className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                              <T k={`attr.${listing.category.slug}.${attrKey}.opt.${v}`} />
                            </span>
                          ))}
                        </div>
                      );
                    }

                    return (
                      <tr key={attrKey} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-medium text-slate-500 w-1/3">
                          <T k={labelKey} />
                          {fieldDef?.unit && (
                            <span className="text-[10px] text-slate-400 ml-1">
                              {fieldDef.unit}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{displayVal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Supplier Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
        <span className="text-xs font-bold text-slate-900 block">
          <T k="public.supplierInfo" />
        </span>

        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">{listing.business.name}</h2>
            <p className="text-xs text-slate-500">{listing.business.businessType}</p>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{listing.business.area}</span>
              <span>{" · "}</span>
              <span>{listing.business.city}</span>
            </div>
          </div>

          <VerificationBadge status={listing.business.verificationStatus} />
        </div>

        <div className="pt-2">
          <Link
            href={`/b/${listing.business.slug}`}
            className="block text-center py-2 px-4 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition"
          >
            <T k="public.viewBusiness" />
          </Link>
        </div>
      </div>
    </div>
  );
}
