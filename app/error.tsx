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
      <p className="text-sm text-slate-600">
        <T k="error.body" />
      </p>
      <div className="flex justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary">
          <T k="error.retry" />
        </button>
        <Link href="/" className="btn btn-secondary">
          <T k="error.home" />
        </Link>
      </div>
    </div>
  );
}
