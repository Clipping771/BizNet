"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Package, ArrowLeft, AlertCircle, Upload, CheckCircle2 } from "lucide-react";
import { T, useT } from "@/components/ui/T";
import { AttributeFields } from "@/components/attributes/AttributeFields";
import { AttributeSchema } from "@/lib/attributes";
import { VerificationStatus } from "@prisma/client";

interface Category {
  id: string;
  slug: string;
  attributeSchema: AttributeSchema;
  defaultUnits: string[];
}

export default function NewListingPage() {
  const t = useT();
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [business, setBusiness] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [moq, setMoq] = useState<string>("");
  const [leadTimeDays, setLeadTimeDays] = useState<string>("");
  const [imageKeys, setImageKeys] = useState<string[]>([]);
  const [attributes, setAttributes] = useState<Record<string, any>>({});

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const res = await fetch("/api/business/listings");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
        setBusiness(data.business);
        if (data.categories?.length > 0) {
          setSelectedCategory(data.categories[0]);
          if (data.categories[0].defaultUnits?.length > 0) {
            setUnit(data.categories[0].defaultUnits[0]);
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    if (cat) {
      setSelectedCategory(cat);
      setAttributes({});
      if (cat.defaultUnits?.length > 0) {
        setUnit(cat.defaultUnits[0]);
      }
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      const ticketRes = await fetch("/api/files/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "image/jpeg",
          sizeBytes: file.size,
          purpose: "listing_image",
        }),
      });

      if (!ticketRes.ok) {
        const errData = await ticketRes.json();
        throw new Error(errData.error || "Image upload failed");
      }

      const { uploadUrl, key } = await ticketRes.json();
      await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });

      setImageKeys((prev) => [...prev, key]);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory) return;

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/business/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: selectedCategory.id,
          title,
          description: description || null,
          unit,
          priceMin: priceMin !== "" ? Number(priceMin) : null,
          priceMax: priceMax !== "" ? Number(priceMax) : null,
          moq: moq !== "" ? Number(moq) : null,
          leadTimeDays: leadTimeDays !== "" ? Number(leadTimeDays) : null,
          imageKeys,
          attributes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create listing");
      }

      router.push("/business/listings");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
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

  if (!isSupplier || !isVerified) {
    return (
      <div className="max-w-xl mx-auto p-4 space-y-4">
        <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-3">
          <p className="font-bold text-sm">
            <T k="listing.verificationRequired" />
          </p>
          <Link
            href="/business/verification"
            className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold text-xs"
          >
            <T k="listing.goToVerification" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/business/listings"
          className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            <T k="listing.new" />
          </h1>
          <p className="text-xs text-slate-500">
            <T k="listing.subtitle" />
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Category Picker */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            <T k="listing.category" />
          </label>
          <select
            value={selectedCategory?.id || ""}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {t(`category.${cat.slug}`)}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            <T k="listing.itemTitle" />
          </label>
          <input
            type="text"
            required
            placeholder={t("listing.titlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Dynamic Category Attributes (§6, A1) */}
        {selectedCategory && (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <span className="text-xs font-bold text-slate-800 block">
              <T k="listing.attributes" />
            </span>
            <AttributeFields
              categorySlug={selectedCategory.slug}
              schema={selectedCategory.attributeSchema}
              values={attributes}
              onChange={setAttributes}
              errors={fieldErrors}
            />
          </div>
        )}

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            <T k="listing.description" />
            {selectedCategory?.slug === "other" && <span className="text-rose-500">·</span>}
          </label>
          <textarea
            rows={3}
            required={selectedCategory?.slug === "other"}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Unit & Prices */}
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

        {/* MOQ & Lead Time */}
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

        {/* Images Upload */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-semibold text-slate-700 block">
            <T k="listing.images" />
          </label>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 cursor-pointer text-slate-700">
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>{t("listing.uploadImage")}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleImageUpload(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
            </label>
            {imageKeys.length > 0 && (
              <span className="text-xs text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{imageKeys.length}</span>
              </span>
            )}
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
