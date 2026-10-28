"use client";

import React, { useState, useEffect } from "react";
import { ShieldCheck, CheckSquare, Clock, FileText, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { T, useT } from "@/components/ui/T";
import { VerificationBadge } from "@/components/business/VerificationBadge";
import { VerificationStatus } from "@prisma/client";

interface VerificationItem {
  id: string;
  businessId: string;
  tradeLicenseNo?: string | null;
  documentKeys: string[];
  referenceName?: string | null;
  referencePhone?: string | null;
  status: VerificationStatus;
  createdAt: string;
  business: {
    id: string;
    name: string;
    slug: string;
    businessType: string;
    area: string;
    city: string;
    addressLine: string;
    verificationStatus: VerificationStatus;
  };
  submittedBy: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
  };
}

export default function AdminVerificationsPage() {
  const t = useT();
  const [verifications, setVerifications] = useState<VerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Review form states indexed by requestId
  const [minutesSpentMap, setMinutesSpentMap] = useState<Record<string, number>>({});
  const [reviewNotesMap, setReviewNotesMap] = useState<Record<string, string>>({});
  const [checklistMap, setChecklistMap] = useState<
    Record<string, { phone: boolean; reference: boolean; document: boolean }>
  >({});

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadVerifications();
  }, []);

  const loadVerifications = async () => {
    try {
      const res = await fetch("/api/admin/verifications");
      if (res.ok) {
        const data = await res.json();
        setVerifications(data.verifications || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDocument = async (key: string) => {
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(key)}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Cannot access private document");
      }
      const data = await res.json();
      window.open(data.url, "_blank");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReviewAction = async (requestId: string, targetStatus: VerificationStatus) => {
    const minutes = minutesSpentMap[requestId];
    if (!minutes || minutes <= 0) {
      alert(t("admin.verifications.minutesSpent"));
      return;
    }

    setProcessingId(requestId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/admin/verifications/${requestId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetStatus,
          minutesSpent: Number(minutes),
          reviewNote: reviewNotesMap[requestId] || "",
          checklist: checklistMap[requestId] || {
            phone: false,
            reference: false,
            document: false,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Review submission failed");
      }

      setSuccess(t("admin.verifications.processed"));
      await loadVerifications();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 text-center text-sm text-slate-500">
        <T k="common.loading" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
        <h1 className="page-title flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <T k="admin.verifications.title" />
        </h1>
        <p className="text-xs text-slate-500">
          <T k="admin.verifications.subtitle" />
        </p>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {verifications.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-100 text-center text-sm text-slate-500">
          <T k="admin.verifications.empty" />
        </div>
      ) : (
        <div className="space-y-6">
          {verifications.map((item) => {
            const currentChecklist = checklistMap[item.id] || {
              phone: false,
              reference: false,
              document: false,
            };

            return (
              <div
                key={item.id}
                data-testid={`verification-card-${item.businessId}`}
                className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4"
              >
                {/* Business Info Header */}
                <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h2 className="font-bold text-slate-900 text-base">{item.business.name}</h2>
                    <p className="text-xs text-slate-500">{item.business.businessType}</p>
                    <p className="text-xs text-slate-400">
                      <span>{item.business.area}</span>
                      <span>{" · "}</span>
                      <span>{item.business.city}</span>
                    </p>
                  </div>
                  <VerificationBadge status={item.business.verificationStatus} />
                </div>

                {/* Submitter & References */}
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl">
                  <div>
                    <span className="font-semibold text-slate-700 block">
                      <T k="business.members" />
                    </span>
                    <span className="text-slate-600 block">{item.submittedBy.name}</span>
                    <span className="text-slate-400 block">{item.submittedBy.phone || item.submittedBy.email}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700 block">
                      <T k="verification.referenceName" />
                    </span>
                    <span className="text-slate-600 block">{item.referenceName || "N/A"}</span>
                    <span className="text-slate-400 block">{item.referencePhone || "N/A"}</span>
                  </div>
                </div>

                {item.tradeLicenseNo && (
                  <div className="text-xs">
                    <span className="font-semibold text-slate-700 mr-2">
                      <T k="verification.tradeLicense" />
                    </span>
                    <span className="font-mono text-slate-900">{item.tradeLicenseNo}</span>
                  </div>
                )}

                {/* Uploaded Documents */}
                {item.documentKeys.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-xs font-semibold text-slate-700 block">
                      <T k="verification.documentPhotos" />
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {item.documentKeys.map((docKey) => (
                        <button
                          key={docKey}
                          type="button"
                          onClick={() => handleOpenDocument(docKey)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>{t("admin.verifications.viewDocument")}</span>
                          <ExternalLink className="w-3 h-3 text-emerald-500" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Checklist (§8.3, B3) */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">
                    <T k="admin.verifications.checklist" />
                  </span>
                  <div className="space-y-1.5 text-xs text-slate-700">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={currentChecklist.phone}
                        onChange={(e) =>
                          setChecklistMap((prev) => ({
                            ...prev,
                            [item.id]: { ...currentChecklist, phone: e.target.checked },
                          }))
                        }
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{t("admin.verifications.checkPhone")}</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={currentChecklist.reference}
                        onChange={(e) =>
                          setChecklistMap((prev) => ({
                            ...prev,
                            [item.id]: { ...currentChecklist, reference: e.target.checked },
                          }))
                        }
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{t("admin.verifications.checkReference")}</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={currentChecklist.document}
                        onChange={(e) =>
                          setChecklistMap((prev) => ({
                            ...prev,
                            [item.id]: { ...currentChecklist, document: e.target.checked },
                          }))
                        }
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{t("admin.verifications.checkDocument")}</span>
                    </label>
                  </div>
                </div>

                {/* Minutes Spent (MANDATORY §17, B3) */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t("admin.verifications.minutesSpent")}</span>
                    <span className="text-rose-500">·</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="15"
                    value={minutesSpentMap[item.id] ?? ""}
                    onChange={(e) =>
                      setMinutesSpentMap((prev) => ({
                        ...prev,
                        [item.id]: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Review Note */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    <T k="admin.verifications.reviewNote" />
                  </label>
                  <textarea
                    rows={2}
                    value={reviewNotesMap[item.id] || ""}
                    onChange={(e) =>
                      setReviewNotesMap((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={processingId === item.id}
                    onClick={() => handleReviewAction(item.id, VerificationStatus.BASIC)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
                  >
                    {t("admin.verifications.approveBasic")}
                  </button>

                  <button
                    type="button"
                    disabled={processingId === item.id}
                    onClick={() => handleReviewAction(item.id, VerificationStatus.VERIFIED)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {t("admin.verifications.approveVerified")}
                  </button>

                  <button
                    type="button"
                    disabled={processingId === item.id}
                    onClick={() => handleReviewAction(item.id, VerificationStatus.REJECTED)}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition disabled:opacity-50"
                  >
                    {t("admin.verifications.reject")}
                  </button>

                  <button
                    type="button"
                    disabled={processingId === item.id}
                    onClick={() => handleReviewAction(item.id, VerificationStatus.SUSPENDED)}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
                  >
                    {t("admin.verifications.suspend")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
