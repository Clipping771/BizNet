"use client";

import Link from "next/link";
import { Sparkles, Package, TrendingUp, MessagesSquare, ArrowRight } from "lucide-react";
import { useT } from "@/components/ui/T";
import { Avatar } from "@/components/layout/AccountMenu";

interface CreateRfqPromptProps {
  businessName?: string;
  userPhone?: string;
}

/**
 * LinkedIn-style "Start a post / Post an RFQ" interactive card at the top of the feed.
 */
export function CreateRfqPrompt({ businessName, userPhone }: CreateRfqPromptProps) {
  const t = useT();

  const actions = [
    {
      href: "/requests/new",
      icon: Sparkles,
      label: "AI Spec Matcher",
      badge: "Fast",
      tone: "text-blue-600 hover:bg-blue-50/80 border-blue-100",
      iconBg: "bg-blue-100/70 text-blue-700",
    },
    {
      href: "/requests/new",
      icon: Package,
      label: "Bulk RFQ",
      badge: "Quotes",
      tone: "text-emerald-700 hover:bg-emerald-50/80 border-emerald-100",
      iconBg: "bg-emerald-100/70 text-emerald-700",
    },
    {
      href: "/prices",
      icon: TrendingUp,
      label: "Market Prices",
      badge: "Live",
      tone: "text-amber-700 hover:bg-amber-50/80 border-amber-100",
      iconBg: "bg-amber-100/70 text-amber-700",
    },
    {
      href: "/q",
      icon: MessagesSquare,
      label: "Supplier Q&A",
      badge: "Ask",
      tone: "text-purple-700 hover:bg-purple-50/80 border-purple-100",
      iconBg: "bg-purple-100/70 text-purple-700",
    },
  ];

  return (
    <div className="card overflow-hidden border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      <div className="flex items-center gap-3">
        <Avatar name={businessName || userPhone || "B"} />
        <Link
          href="/requests/new"
          id="feed-create-rfq-trigger"
          className="group flex flex-1 items-center justify-between rounded-full border border-slate-200/90 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-500 transition-all hover:border-primary-400 hover:bg-white hover:text-slate-800 hover:shadow-sm"
        >
          <span className="truncate font-normal">
            Looking for packaging, materials, or suppliers? <span className="hidden font-medium text-primary sm:inline">Post an RFQ...</span>
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:translate-x-0.5 group-hover:bg-primary group-hover:text-white">
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 pt-3">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <Link
              key={act.label}
              href={act.href}
              className={`flex flex-1 min-w-[130px] items-center justify-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-semibold transition-all ${act.tone}`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-md ${act.iconBg}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="truncate">{act.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
