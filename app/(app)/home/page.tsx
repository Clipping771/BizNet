import Link from "next/link";
import {
  Plus,
  Search,
  Sparkles,
  Box,
  Package,
  ShoppingBag,
  CupSoda,
  ArrowRight,
} from "lucide-react";
import { T } from "@/components/ui/T";
import { HomeActivity } from "@/components/home/HomeActivity";
import { CreateRfqPrompt } from "@/components/home/CreateRfqPrompt";
import { HomeProfileCard } from "@/components/home/HomeProfileCard";
import { HomeMarketWidgets } from "@/components/home/HomeMarketWidgets";
import { getSession } from "@/lib/session";
import { findBusinessById } from "@/lib/repo/business";
import { prisma } from "@/lib/prisma";

import { OrderStatus } from "@prisma/client";

export default async function HomePage() {
  const session = await getSession();
  const business = session.activeBusinessId ? await findBusinessById(session.activeBusinessId).catch(() => null) : null;

  let stats = { openRequests: 0, totalQuotes: 0, activeOrders: 0 };
  let topSuppliers: Array<{
    id: string;
    name: string;
    area: string;
    city: string;
    businessType: string;
  }> = [];

  try {
    if (business?.id) {
      const [openReqs, quotesCount, ordersCount] = await Promise.all([
        prisma.request.count({ where: { buyerBusinessId: business.id, status: "OPEN" } }),
        prisma.quote.count({ where: { request: { buyerBusinessId: business.id } } }),
        prisma.order.count({
          where: {
            buyerBusinessId: business.id,
            status: { in: [OrderStatus.CONFIRMED, OrderStatus.DISPATCHED, OrderStatus.DELIVERED] },
          },
        }),
      ]);
      stats = { openRequests: openReqs, totalQuotes: quotesCount, activeOrders: ordersCount };
    }

    topSuppliers = await prisma.business.findMany({
      where: { isSupplier: true, verificationStatus: "VERIFIED", isSuspended: false, deletedAt: null },
      take: 4,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, area: true, city: true, businessType: true },
    });
  } catch {
    // Graceful fallback if database read has issues
  }

  const categories = [
    { slug: "containers", icon: Box },
    { slug: "food_boxes", icon: Package },
    { slug: "carry_bags", icon: ShoppingBag },
    { slug: "cups", icon: CupSoda },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4 animate-fade-up pt-1">
      {/* 3-Column LinkedIn/FB B2B Layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left Column (Desktop 3/12 cols): Profile & Quick Navigation */}
        <div className="lg:col-span-3 space-y-4">
          <HomeProfileCard business={business} userPhone={session.phone} stats={stats} />

          {/* Quick Categories Navigation */}
          <div className="card overflow-hidden border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                <T k="home.popularCategories" />
              </h3>
              <Link href="/search" className="text-xs font-semibold text-primary hover:underline">
                <T k="common.viewAll" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {categories.map(({ slug, icon: Icon }) => (
                <Link
                  key={slug}
                  href={`/search?category=${slug}`}
                  className="group flex flex-col gap-1.5 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 transition hover:border-primary-200 hover:bg-primary-50/60"
                >
                  <Icon className="h-4 w-4 text-slate-500 transition group-hover:text-primary" />
                  <span className="truncate text-xs font-semibold text-slate-800">
                    <T k={`category.${slug}`} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Center Column (Desktop 6/12 cols): Core Feed & Interactive RFQ Box */}
        <div className="lg:col-span-6 space-y-4">
          {/* LinkedIn-style "Start an RFQ" prompt */}
          <CreateRfqPrompt businessName={business?.name} userPhone={session.phone} />

          {/* AI Smart RFQ Banner */}
          <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/90 via-slate-50 to-white p-5 shadow-sm">
            <div className="relative flex items-center justify-between gap-4">
              <div className="max-w-md">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-100/70 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                  <Sparkles className="h-3 w-3" />
                  <T k="home.aiBadge" />
                </span>
                <h2 className="mt-2 text-base font-bold text-slate-900 sm:text-lg">
                  <T k="home.aiTitle" />
                </h2>
                <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                  <T k="home.aiSubtitle" />
                </p>
                <div className="mt-3.5 flex items-center gap-2.5">
                  <Link href="/requests/new" className="btn btn-primary btn-sm text-xs">
                    <Plus className="h-3.5 w-3.5" />
                    <T k="home.newRequest" />
                  </Link>
                  <Link href="/search" className="btn btn-secondary btn-sm text-xs">
                    <Search className="h-3.5 w-3.5" />
                    Browse Suppliers
                  </Link>
                </div>
              </div>
              <div className="hidden sm:flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-md">
                <Sparkles className="h-10 w-10 text-white/90" />
              </div>
            </div>
          </div>

          {/* Activity Stream */}
          <HomeActivity />
        </div>

        {/* Right Column (Desktop 3/12 cols): Market Benchmarks & Verified Suppliers */}
        <div className="lg:col-span-3 space-y-4">
          <HomeMarketWidgets topSuppliers={topSuppliers} />
        </div>
      </div>
    </div>
  );
}
