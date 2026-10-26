"use client";

import React, { useState } from "react";
import { CheckCircle2, ShieldCheck, ShieldAlert, Clock, AlertCircle } from "lucide-react";
import { useT } from "@/components/ui/T";
import { VerificationStatus } from "@prisma/client";

interface VerificationBadgeProps {
  status: VerificationStatus | string;
  showTooltip?: boolean;
  className?: string;
}

export function VerificationBadge({
  status,
  showTooltip = true,
  className = "",
}: VerificationBadgeProps) {
  const t = useT();
  const [tooltipVisible, setTooltipVisible] = useState(false);

  if (status === VerificationStatus.BASIC || status === "BASIC") {
    return (
      <div className={`relative inline-flex items-center ${className}`}>
        <span
          onMouseEnter={() => setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
          onFocus={() => setTooltipVisible(true)}
          onBlur={() => setTooltipVisible(false)}
          tabIndex={0}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-help"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>{t("badge.verifiedBasic")}</span>
        </span>
        {showTooltip && tooltipVisible && (
          <div
            role="tooltip"
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 p-2 text-xs bg-slate-900 text-slate-100 rounded-lg shadow-lg z-50 text-center leading-snug"
          >
            {t("badge.tooltip")}
          </div>
        )}
      </div>
    );
  }

  if (status === VerificationStatus.VERIFIED || status === "VERIFIED") {
    return (
      <div className={`relative inline-flex items-center ${className}`}>
        <span
          onMouseEnter={() => setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
          onFocus={() => setTooltipVisible(true)}
          onBlur={() => setTooltipVisible(false)}
          tabIndex={0}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 cursor-help"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
          <span>{t("badge.verified")}</span>
        </span>
        {showTooltip && tooltipVisible && (
          <div
            role="tooltip"
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 p-2 text-xs bg-slate-900 text-slate-100 rounded-lg shadow-lg z-50 text-center leading-snug"
          >
            {t("badge.tooltip")}
          </div>
        )}
      </div>
    );
  }

  if (status === VerificationStatus.PENDING || status === "PENDING") {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 ${className}`}>
        <Clock className="w-3.5 h-3.5 text-amber-600" />
        <span>{t("badge.pending")}</span>
      </span>
    );
  }

  if (status === VerificationStatus.SUSPENDED || status === "SUSPENDED") {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 ${className}`}>
        <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
        <span>{t("badge.suspended")}</span>
      </span>
    );
  }

  if (status === VerificationStatus.REJECTED || status === "REJECTED") {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 ${className}`}>
        <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
        <span>{t("badge.rejected")}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-slate-500 bg-slate-50 border border-slate-200 ${className}`}>
      <span>{t("badge.unverified")}</span>
    </span>
  );
}
