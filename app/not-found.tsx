import Link from "next/link";
import { T } from "@/components/ui/T";

export default function NotFound() {
  return (
    <div className="page p-8 text-center space-y-3">
      <h1 className="page-title">
        <T k="error.notFoundTitle" />
      </h1>
      <p className="text-sm text-gray-600">
        <T k="error.notFoundBody" />
      </p>
      <Link href="/" className="inline-block px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold">
        <T k="error.home" />
      </Link>
    </div>
  );
}
