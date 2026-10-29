import Link from "next/link";
import { TrendingUp, ShieldCheck, BadgeCheck, ChevronRight, Store, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { T } from "@/components/ui/T";

interface HomeMarketWidgetsProps {
  topSuppliers: Array<{
    id: string;
    name: string;
    area: string;
    city: string;
    businessType: string;
  }>;
}

/**
 * LinkedIn-style Right Sidebar Widgets: Market Trends, Verified Suppliers & Trust Guarantee.
 */
export function HomeMarketWidgets({ topSuppliers }: HomeMarketWidgetsProps) {
  const priceBenchmarks = [
    { title: "Food Containers (PP/PET)", change: "+2.4%", trend: "up", base: "$0.08 / pc" },
    { title: "Corrugated Cartons (3-Ply)", change: "-1.1%", trend: "down", base: "$0.32 / pc" },
    { title: "Kraft Paper Carry Bags", change: "+0.8%", trend: "up", base: "$0.14 / pc" },
    { title: "Single-wall Paper Cups", change: "Stable", trend: "neutral", base: "$0.04 / pc" },
  ];

  return (
    <aside className="space-y-4">
      {/* Market Intelligence Widget */}
      <div className="card overflow-hidden border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-primary">
              <TrendingUp className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold text-slate-900">Market Price Index</h3>
          </div>
          <Link href="/prices" className="text-xs font-semibold text-primary hover:underline">
            View All
          </Link>
        </div>

        <div className="mt-3 divide-y divide-slate-100">
          {priceBenchmarks.map((item) => (
            <div key={item.title} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <p className="truncate text-xs font-semibold text-slate-800">{item.title}</p>
                <p className="text-[11px] text-slate-400">Benchmark: {item.base}</p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold ${
                  item.trend === "up"
                    ? "bg-emerald-50 text-emerald-700"
                    : item.trend === "down"
                    ? "bg-rose-50 text-rose-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.change}
                {item.trend === "up" && <ArrowUpRight className="h-3 w-3" />}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Verified Suppliers Widget */}
      {topSuppliers.length > 0 && (
        <div className="card overflow-hidden border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <Store className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-bold text-slate-900">Verified Suppliers</h3>
            </div>
            <Link href="/search?supplier=true" className="text-xs font-semibold text-primary hover:underline">
              Explore
            </Link>
          </div>

          <div className="mt-3 space-y-3">
            {topSuppliers.map((sup) => (
              <div key={sup.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-bold text-slate-900">{sup.name}</p>
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                  </div>
                  <p className="truncate text-[11px] text-slate-500">
                    {sup.businessType || "Packaging Manufacturer"}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {[sup.area, sup.city].filter(Boolean).join(", ")}
                  </p>
                </div>
                <Link
                  href={`/requests/new?directSupplierId=${sup.id}`}
                  className="inline-flex shrink-0 items-center rounded-full border border-primary/30 bg-primary-50/60 px-2.5 py-1 text-[11px] font-semibold text-primary transition hover:bg-primary hover:text-white"
                >
                  Quote
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trust & Escrow Guarantee */}
      <div className="card overflow-hidden border border-slate-200/80 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-emerald-400">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-bold text-white">BizNet Safe Trade</h3>
        </div>
        <p className="mt-2 text-xs text-slate-300 leading-relaxed">
          All suppliers undergo business verification. Every RFQ and quotation is securely tracked with transparent payment terms.
        </p>
        <div className="mt-3 space-y-1.5 border-t border-slate-700/60 pt-3 text-[11px] text-slate-300">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>Verified GST / Business Registration</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>Direct Quotes & Milestone Protections</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
