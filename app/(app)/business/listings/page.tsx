"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Package, Edit, ExternalLink, AlertTriangle, ShieldCheck } from "lucide-react";
import { T, useT } from "@/components/ui/T";
import { VerificationBadge } from "@/components/business/VerificationBadge";
import { VerificationStatus } from "@prisma/client";

interface ListingItem {
  id: string;
  title: string;
  unit: string;
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
      <div className="max-w-xl mx-auto p-4 text-center text-sm text-slate-500">
        <T k="common.loading" />
      </div>
    );
  }

  const isVerified =
    business?.verificationStatus === VerificationStatus.BASIC ||
    business?.verificationStatus === VerificationStatus.VERIFIED;
  const isSupplier = business?.isSupplier;

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-600" />
            <T k="listing.title" />
          </h1>
          <p className="text-xs text-slate-500">
            <T k="listing.subtitle" />
          </p>
        </div>

        {isVerified && isSupplier && (
          <Link
            href="/business/listings/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>{t("listing.new")}</span>
          </Link>
        )}
      </div>

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
      <div className="space-y-3">
        {listings.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-100 text-center text-sm text-slate-400">
            <T k="listing.noListings" />
          </div>
        ) : (
          listings.map((item) => (
            <div
              key={item.id}
              className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between"
            >
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md inline-block">
                  {t(`category.${item.category.slug}`)}
                </span>
                <h2 className="text-sm font-bold text-slate-900">{item.title}</h2>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  {item.priceMin || item.priceMax ? (
                    <>
                      <span>{item.priceMin ?? ""}</span>
                      <span>{" / "}</span>
                      <span>{item.priceMax ?? ""}</span>
                      <span>{" · "}</span>
                      <span>{item.unit}</span>
                    </>
                  ) : (
                    <span>{item.unit}</span>
                  )}
                  {item.moq && (
                    <>
                      <span>{" · "}</span>
                      <span>
                        <T k="listing.moq" />
                      </span>
                      <span>{" "}</span>
                      <span>{item.moq}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/business/listings/${item.id}/edit`}
                  className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition"
                  title="Edit"
                >
                  <Edit className="w-4 h-4" />
                </Link>
                <Link
                  href={`/l/${item.id}`}
                  target="_blank"
                  className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition"
                  title="View Public Page"
                >
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
