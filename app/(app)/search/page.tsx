import { T } from "@/components/ui/T";

export default function SearchPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">
        <T k="search.title" />
      </h2>
      <div className="bg-white p-6 rounded-2xl border border-gray-100 text-center text-gray-500 text-xs">
        <p>
          <T k="search.description" />
        </p>
      </div>
    </div>
  );
}
