"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2, AlertCircle } from "lucide-react";
import { T, useT } from "@/components/ui/T";
import { AttributeFields } from "@/components/attributes/AttributeFields";
import { AttributeSchema } from "@/lib/attributes";

interface Category {
  id: string;
  slug: string;
  attributeSchema: AttributeSchema;
}

export default function EditListingPage() {
  const t = useT();
  const router = useRouter();
  const params = useParams();
  const listingId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [category, setCategory] = useState<Category | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [moq, setMoq] = useState<string>("");
  const [leadTimeDays, setLeadTimeDays] = useState<string>("");
  const [attributes, setAttributes] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);

  const fetchListing = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/business/listings/${listingId}`);
      if (!res.ok) {
        throw new Error("Failed to load listing");
      }
      const data = await res.json();
      const l = data.listing;
      setTitle(l.title);
      setDescription(l.description || "");
      setUnit(l.unit);
      setPriceMin(l.priceMin !== null ? String(l.priceMin) : "");
      setPriceMax(l.priceMax !== null ? String(l.priceMax) : "");
      setMoq(l.moq !== null ? String(l.moq) : "");
      setLeadTimeDays(l.leadTimeDays !== null ? String(l.leadTimeDays) : "");
      setCategory(l.category);
      setAttributes((l.attributes as Record<string, any>) || {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/business/listings/${listingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          unit,
          priceMin: priceMin !== "" ? Number(priceMin) : null,
          priceMax: priceMax !== "" ? Number(priceMax) : null,
          moq: moq !== "" ? Number(moq) : null,
          leadTimeDays: leadTimeDays !== "" ? Number(leadTimeDays) : null,
          attributes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Update failed");
      }

      router.push("/business/listings");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("listing.deleteConfirm"))) return;
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/business/listings/${listingId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }

      router.push("/business/listings");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto p-4 text-center text-sm text-slate-500">
        <T k="common.loading" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/business/listings"
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              <T k="listing.edit" />
            </h1>
            <p className="text-xs text-slate-500">
              <T k="listing.subtitle" />
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={deleting}
          onClick={handleDelete}
          className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition"
          title="Delete Listing"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            <T k="listing.itemTitle" />
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {category && (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <span className="text-xs font-bold text-slate-800 block">
              <T k="listing.attributes" />
            </span>
            <AttributeFields
              categorySlug={category.slug}
              schema={category.attributeSchema}
              values={attributes}
              onChange={setAttributes}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            <T k="listing.description" />
            {category?.slug === "other" && <span className="text-rose-500">·</span>}
          </label>
          <textarea
            rows={3}
            required={category?.slug === "other"}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              <T k="listing.unit" />
            </label>
            <input
              type="text"
              required
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              <T k="listing.priceMin" />
            </label>
            <input
              type="number"
              step="0.01"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              <T k="listing.priceMax" />
            </label>
            <input
              type="number"
              step="0.01"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              <T k="listing.moq" />
            </label>
            <input
              type="number"
              value={moq}
              onChange={(e) => setMoq(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              <T k="listing.leadTime" />
            </label>
            <input
              type="number"
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-sm transition shadow-sm disabled:opacity-50"
        >
          {submitting ? t("listing.saving") : t("listing.save")}
        </button>
      </form>
    </div>
  );
}
