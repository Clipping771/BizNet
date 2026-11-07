"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Package, Edit, ExternalLink, AlertTriangle } from "lucide-react";
import { T, useT } from "@/components/ui/T";
import { EmptyState, PageHeader } from "@/components/ui/ListStates";
import { MoneyRange, Num } from "@/components/ui/Num";

const VerificationStatus = { BASIC: "BASIC", VERIFIED: "VERIFIED" } as const;

interface ListingItem {
  id: string;
  title: string;
  unit: string;
  currency?: string;
  priceMin?: number | null;
  priceMax?: number | null;
  moq?: number | null;
  isActive: boolean;
  category: {
    id: string;
    slug: string;
  };
}

export default function BusinessListingsPage() {
  const t = useT();
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [business, setBusiness] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    try {
      const res = await fetch("/api/business/listings");
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings || []);
        setBusiness(data.business);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page text-center text-sm text-slate-500">
        <T k="common.loading" />
      </div>
    );
  }

  const isVerified =
    business?.verificationStatus === VerificationStatus.BASIC ||
    business?.verificationStatus === VerificationStatus.VERIFIED;
  const isSupplier = business?.isSupplier;

  return (
    <div className="page-wide space-y-4">
      <PageHeader titleKey="listing.title" subtitleKey="listing.subtitle">
        {isVerified && isSupplier && (
          <Link href="/business/listings/new" className="btn btn-primary">
            <Plus className="h-4 w-4" />
            <span>{t("listing.new")}</span>
          </Link>
        )}
      </PageHeader>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
          <span>{error}</span>
        </div>
      )}

      {/* Supplier Role Warning */}
      {!isSupplier && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
          <p className="font-semibold">{t("listing.supplierOnly")}</p>
        </div>
      )}

      {/* Verification Warning (§7, C2) */}
      {isSupplier && !isVerified && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-semibold">{t("listing.verificationRequired")}</span>
          </div>
          <div>
            <Link
              href="/business/verification"
              className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
            >
              <span>{t("listing.goToVerification")}</span>
            </Link>
          </div>
        </div>
      )}

      {/* Listings List */}
      {listings.length === 0 ? (
        <EmptyState k="listing.noListings" icon={Package} />
      ) : (
        <div className="card table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th><T k="listing.titleField" /></th>
                <th className="hidden md:table-cell"><T k="listing.category" /></th>
                <th className="text-end"><T k="home.stat.price" /></th>
                <th className="hidden text-end sm:table-cell"><T k="listing.moq" /></th>
                <th><span className="sr-only">{t("common.edit")}</span></th>
              </tr>
            </thead>
            <tbody>
              {listings.map((item) => (
                <tr key={item.id}>
                  <td className="max-w-[20rem]">
                    <Link href={`/l/${item.id}`} className="block truncate font-medium text-slate-900 hover:text-primary-700">
                      {item.title}
                    </Link>
                  </td>
                  <td className="hidden whitespace-nowrap md:table-cell">{t(`category.${item.category.slug}`)}</td>
                  <td className="whitespace-nowrap text-end font-medium text-slate-900">
                    {item.priceMin != null ? (
                      <MoneyRange min={Number(item.priceMin)} max={item.priceMax != null ? Number(item.priceMax) : null} currency={item.currency} />
                    ) : (
                      "—"
                    )}
                    <span className="ms-1 text-xs font-normal text-slate-500">{item.unit}</span>
                  </td>
                  <td className="hidden whitespace-nowrap text-end sm:table-cell">{item.moq != null ? <Num n={item.moq} /> : "—"}</td>
                  <td className="text-end">
                    <span className="flex justify-end gap-1">
                      <Link href={`/business/listings/${item.id}/edit`} className="btn btn-ghost btn-sm" aria-label={t("common.edit")} title={t("common.edit")}>
                        <Edit className="h-4 w-4" />
                      </Link>
                      <Link href={`/l/${item.id}`} target="_blank" className="btn btn-ghost btn-sm" aria-label={t("public.viewListing")} title={t("public.viewListing")}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
