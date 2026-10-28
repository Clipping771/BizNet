"use client";

import { useEffect } from "react";
import Link from "next/link";
import { T } from "@/components/ui/T";

/** Route-level error boundary: friendly message, retry, no stack traces shown to users. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="page p-8 text-center space-y-3">
      <h1 className="page-title">
        <T k="error.title" />
      </h1>
      <p className="text-sm text-gray-600">
        <T k="error.body" />
      </p>
      <div className="flex justify-center gap-2">
        <button type="button" onClick={reset} className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold">
          <T k="error.retry" />
        </button>
        <Link href="/" className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700">
          <T k="error.home" />
        </Link>
      </div>
    </div>
  );
}
