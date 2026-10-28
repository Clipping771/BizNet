"use client";

import React, { useState, useEffect } from "react";
import { ShieldCheck, Upload, FileText, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { T, useT } from "@/components/ui/T";
import { VerificationBadge } from "@/components/business/VerificationBadge";
import { VerificationStatus } from "@prisma/client";

export default function BusinessVerificationPage() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [business, setBusiness] = useState<any>(null);
  const [latestRequest, setLatestRequest] = useState<any>(null);

  const [tradeLicenseNo, setTradeLicenseNo] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [referencePhone, setReferencePhone] = useState("");
  const [documentKeys, setDocumentKeys] = useState<string[]>([]);
  const [shopPhotoKey, setShopPhotoKey] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/business/verification");
      if (res.ok) {
        const data = await res.json();
        setBusiness(data.business);
        setLatestRequest(data.latestRequest);
        if (data.latestRequest) {
          setTradeLicenseNo(data.latestRequest.tradeLicenseNo || "");
          setReferenceName(data.latestRequest.referenceName || "");
          setReferencePhone(data.latestRequest.referencePhone || "");
          setDocumentKeys(data.latestRequest.documentKeys || []);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File, purpose: "verification_document" | "shop_photo") => {
    try {
      if (purpose === "verification_document") setUploadingDoc(true);
      setError(null);

      // 1. Request presigned upload ticket
      const ticketRes = await fetch("/api/files/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          purpose,
        }),
      });

      if (!ticketRes.ok) {
        const errData = await ticketRes.json();
        throw new Error(errData.error || "Failed to initialize upload");
      }

      const { uploadUrl, key } = await ticketRes.json();

      // 2. Upload file via presigned PUT
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload file content");
      }

      if (purpose === "verification_document") {
        setDocumentKeys((prev) => [...prev, key]);
      } else {
        setShopPhotoKey(key);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/business/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeLicenseNo: tradeLicenseNo || null,
          referenceName: referenceName || null,
          referencePhone: referencePhone || null,
          documentKeys,
          shopPhotoKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Submission failed");
      }

      setSuccess(t("verification.success"));
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page text-center text-sm text-slate-500">
        <T k="common.loading" />
      </div>
    );
  }

  const status = business?.verificationStatus || VerificationStatus.UNVERIFIED;
  const isPending = status === VerificationStatus.PENDING;
  const isVerified = status === VerificationStatus.BASIC || status === VerificationStatus.VERIFIED;

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="page-title">
              <T k="verification.title" />
            </h1>
            <p className="text-xs text-slate-500">
              <T k="verification.subtitle" />
            </p>
          </div>
          <VerificationBadge status={status} />
        </div>

        {isPending && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
            <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>{t("verification.pendingAlert")}</span>
          </div>
        )}

        {isVerified && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{t("verification.verifiedAlert")}</span>
          </div>
        )}
      </div>

      {/* Verification Form */}
      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* Trade License (Optional) */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            <T k="verification.tradeLicense" />
          </label>
          <input
            type="text"
            value={tradeLicenseNo}
            disabled={isPending}
            onChange={(e) => setTradeLicenseNo(e.target.value)}
            className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
          />
        </div>

        {/* Reference Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            <T k="verification.referenceName" />
          </label>
          <input
            type="text"
            value={referenceName}
            disabled={isPending}
            onChange={(e) => setReferenceName(e.target.value)}
            className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
          />
        </div>

        {/* Reference Phone */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            <T k="verification.referencePhone" />
          </label>
          <input
            type="text"
            value={referencePhone}
            disabled={isPending}
            onChange={(e) => setReferencePhone(e.target.value)}
            className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
          />
        </div>

        {/* Document Photos Upload */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-semibold text-slate-700 block">
            <T k="verification.documentPhotos" />
          </label>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 cursor-pointer text-slate-700">
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>{t("verification.uploadDocument")}</span>
              <input
                type="file"
                disabled={isPending || uploadingDoc}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleFileUpload(e.target.files[0], "verification_document");
                  }
                }}
                className="hidden"
                accept="image/*,application/pdf"
              />
            </label>
            {uploadingDoc && (
              <span className="text-xs text-slate-400">
                <T k="common.loading" />
              </span>
            )}
          </div>

          {documentKeys.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-xs text-slate-500 block">
                <T k="verification.uploadedFiles" />
              </span>
              {documentKeys.map((k) => (
                <div key={k} className="p-2 bg-slate-50 rounded-lg text-xs text-slate-600 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">{k}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Shop / Factory Photo */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-semibold text-slate-700 block">
            <T k="verification.shopPhoto" />
          </label>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 cursor-pointer text-slate-700">
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>{t("verification.uploadShop")}</span>
              <input
                type="file"
                disabled={isPending}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleFileUpload(e.target.files[0], "shop_photo");
                  }
                }}
                className="hidden"
                accept="image/*"
              />
            </label>
            {shopPhotoKey && (
              <span className="text-xs text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{shopPhotoKey}</span>
              </span>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-3">
          <button
            type="submit"
            disabled={isPending || submitting}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-sm transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? t("verification.submitting") : t("verification.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
