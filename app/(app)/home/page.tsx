import Link from "next/link";
import { PlusCircle, Search, MessageSquare, ShieldCheck, ArrowRight, Layers } from "lucide-react";
import { T } from "@/components/ui/T";

export default function HomePage() {
  const categories = [
    { slug: "containers", name: "ফুড কন্টেইনার", icon: "🍱", desc: "৭৫০ মিলি, ৫০০ মিলি, ঢাকনাওয়ালা" },
    { slug: "food_boxes", name: "ফুড বক্স ও কার্টুন", icon: "📦", desc: "ক্রাফট পেপার, লাঞ্চ বক্স" },
    { slug: "carry_bags", name: "শপিং ও ক্যারি ব্যাগ", icon: "🛍️", desc: "ডাই-কাট, লুপ হ্যান্ডেল" },
    { slug: "cups", name: "ডিসপোজেবল কাপ", icon: "☕", desc: "পেপার কাপ, কোল্ড ড্রিঙ্কস" },
  ];

  return (
    <div className="space-y-4">
      {/* Hero CTA: What do you need? */}
      <div className="bg-gradient-to-br from-primary to-primary-hover text-white rounded-2xl p-5 shadow-sm">
        <span className="inline-block px-2.5 py-0.5 bg-white/20 text-white text-[10px] font-bold tracking-wider uppercase rounded-full mb-2">
          <T k="home.aiBadge" />
        </span>
        <h2 className="text-lg font-bold mb-1">
          <T k="home.aiTitle" />
        </h2>
        <p className="text-xs text-white/80 mb-4">
          <T k="home.aiSubtitle" />
        </p>
        <Link
          href="/requests/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-primary font-bold text-xs rounded-xl shadow-sm hover:bg-gray-50 transition-all"
        >
          <PlusCircle className="w-4 h-4 text-primary" />
          <T k="home.newRequest" />
        </Link>
      </div>

      {/* Quick Search Card */}
      <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm">
        <Link
          href="/search"
          className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl text-gray-400 hover:text-gray-600 border border-gray-100 text-xs"
        >
          <Search className="w-4 h-4 text-gray-400" />
          <T k="home.searchPlaceholder" />
        </Link>
      </div>

      {/* Top Categories */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-primary" />
            <T k="home.popularCategories" />
          </h3>
          <Link href="/search" className="text-xs text-primary font-medium flex items-center gap-0.5">
            <T k="home.viewAll" />
            <ArrowRight className="w-3 h-3 rtl:rotate-180" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/search?category=${c.slug}`}
              className="p-3 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 transition-all"
            >
              <div className="text-xl mb-1">{c.icon}</div>
              <p className="font-semibold text-xs text-gray-900">{c.name}</p>
              <p className="text-[10px] text-gray-500 truncate">{c.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Discussion Card */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-semibold text-xs text-gray-900">
              <T k="home.discussionTitle" />
            </h4>
            <p className="text-[11px] text-gray-500">
              <T k="home.discussionSubtitle" />
            </p>
          </div>
        </div>
        <Link
          href="/q"
          className="text-xs font-semibold text-primary px-3 py-1.5 rounded-lg bg-primary-light hover:bg-primary/20 shrink-0"
        >
          <T k="home.viewDiscussion" />
        </Link>
      </div>

      {/* Trust & Identity Badge */}
      <div className="p-3 rounded-xl bg-gray-50 border border-gray-200/60 flex items-center gap-2 text-xs text-gray-600">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
        <p className="text-[11px]">
          <T k="home.trustBadge" />
        </p>
      </div>
    </div>
  );
}
