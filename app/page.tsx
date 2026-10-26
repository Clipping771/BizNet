import Link from "next/link";
import { Package, ShieldCheck, ArrowRight } from "lucide-react";
import { T } from "@/components/ui/T";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6">
        <Package className="w-8 h-8" />
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        <T k="app.title" />
      </h1>
      <p className="text-sm text-gray-600 mb-8 max-w-sm">
        <T k="app.tagline" />
      </p>

      <div className="w-full max-w-xs space-y-3">
        <Link
          href="/login"
          className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-primary text-white font-medium rounded-xl hover:bg-primary-hover shadow-sm transition-all"
        >
          <T k="auth.login" />
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
        <Link
          href="/home"
          className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-gray-50 text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-100 transition-all text-sm"
        >
          <T k="nav.home" />
        </Link>
      </div>

      <div className="mt-12 flex items-center gap-2 text-xs text-gray-500">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <T k="landing.trustBadge" />
      </div>
    </div>
  );
}
