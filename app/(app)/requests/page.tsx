import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { T } from "@/components/ui/T";

export default function RequestsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">
          <T k="requests.title" />
        </h2>
        <Link
          href="/requests/new"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-hover shadow-sm"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <T k="home.newRequest" />
        </Link>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-gray-100 text-center text-gray-500 text-xs">
        <p className="font-semibold text-gray-800 mb-1">
          <T k="requests.activeSubtitle" />
        </p>
        <p>
          <T k="requests.activeDescription" />
        </p>
      </div>
    </div>
  );
}
