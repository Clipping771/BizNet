import Link from "next/link";
import { BadgeCheck, FileText, ReceiptText, Package, Settings, ChevronRight, MapPin } from "lucide-react";
import { Avatar } from "@/components/layout/AccountMenu";

interface HomeProfileCardProps {
  business: {
    id: string;
    name: string;
    businessType?: string | null;
    city?: string | null;
    area?: string | null;
    verificationStatus?: string | null;
  } | null;
  userPhone?: string;
  stats: {
    openRequests: number;
    totalQuotes: number;
    activeOrders: number;
  };
}

/**
 * LinkedIn-style Left Sidebar Profile Card with banner, avatar, verified badge, and stats.
 */
export function HomeProfileCard({ business, userPhone, stats }: HomeProfileCardProps) {
  const isVerified = business?.verificationStatus === "VERIFIED";

  return (
    <div className="card overflow-hidden border border-slate-200/80 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Cover Banner */}
      <div className="h-16 w-full bg-gradient-to-r from-slate-800 via-primary-800 to-primary-600 sm:h-20" />

      {/* Avatar + Info */}
      <div className="relative px-4 pb-4 pt-0">
        <div className="-mt-8 flex items-end justify-between sm:-mt-10">
          <div className="relative rounded-full ring-4 ring-white shadow-sm">
            <Avatar name={business?.name || userPhone || "B"} />
            {isVerified && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white ring-2 ring-white">
                <BadgeCheck className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          {isVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">
              Verified Partner
            </span>
          ) : (
            <Link
              href="/business/settings"
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-200"
            >
              Get Verified
            </Link>
          )}
        </div>

        <div className="mt-3">
          <Link href="/business/settings" className="group flex items-center gap-1.5">
            <h2 className="text-base font-bold text-slate-900 group-hover:text-primary transition-colors">
              {business?.name || "My Business"}
            </h2>
          </Link>
          <p className="text-xs font-medium text-slate-500">
            {business?.businessType || "B2B Enterprise Member"}
          </p>
          {(business?.city || business?.area) && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{[business?.area, business?.city].filter(Boolean).join(", ")}</span>
            </p>
          )}
        </div>

        {/* Stats Grid */}
        <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/70 py-2 text-center">
          <Link href="/requests" className="px-1 hover:opacity-80 transition-opacity">
            <span className="block text-sm font-bold text-slate-900">{stats.openRequests}</span>
            <span className="block text-[10px] font-medium text-slate-500 uppercase tracking-tight">Active RFQs</span>
          </Link>
          <Link href="/quotes" className="px-1 hover:opacity-80 transition-opacity">
            <span className="block text-sm font-bold text-slate-900">{stats.totalQuotes}</span>
            <span className="block text-[10px] font-medium text-slate-500 uppercase tracking-tight">Quotes</span>
          </Link>
          <Link href="/orders" className="px-1 hover:opacity-80 transition-opacity">
            <span className="block text-sm font-bold text-slate-900">{stats.activeOrders}</span>
            <span className="block text-[10px] font-medium text-slate-500 uppercase tracking-tight">Orders</span>
          </Link>
        </div>

        {/* Quick Links */}
        <div className="mt-4 space-y-1 border-t border-slate-100 pt-3">
          <Link
            href="/requests"
            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <span className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-slate-500" />
              Manage RFQs
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </Link>
          <Link
            href="/quotes"
            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <span className="flex items-center gap-2">
              <ReceiptText className="h-3.5 w-3.5 text-slate-500" />
              Quotation Deals
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </Link>
          <Link
            href="/orders"
            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <span className="flex items-center gap-2">
              <Package className="h-3.5 w-3.5 text-slate-500" />
              Active Orders
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </Link>
          <Link
            href="/business/settings"
            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <span className="flex items-center gap-2">
              <Settings className="h-3.5 w-3.5 text-slate-500" />
              Business Settings
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </Link>
        </div>
      </div>
    </div>
  );
}
