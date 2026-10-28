"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ShoppingCart, Truck, CheckCircle2 } from "lucide-react";
import { T } from "@/components/ui/T";

export default function OnboardingPage() {
  const router = useRouter();
  const [role, setRole] = useState<"buyer" | "supplier" | "both">("buyer");
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("Restaurant / Café");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("Dhaka");
  const [addressLine, setAddressLine] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          businessType,
          isBuyer: role === "buyer" || role === "both",
          isSupplier: role === "supplier" || role === "both",
          area: area || "Main",
          city: city || "Dhaka",
          addressLine,
          whatsapp,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create business");
      }

      router.push("/home");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div>
        <h2 className="mb-2 text-[28px] font-normal leading-tight tracking-[-0.01em] text-gray-900">
          <T k="business.setupTitle" />
        </h2>
        <p className="mb-8 text-[15px] text-gray-600">
          <T k="business.setupSubtitle" />
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-secondary text-xs rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              <T k="business.role" />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setRole("buyer");
                  setBusinessType("Restaurant / Café");
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition-all ${
                  role === "buyer"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <ShoppingCart className="w-5 h-5 mb-1 text-primary" />
                <T k="business.weBuy" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setRole("supplier");
                  setBusinessType("Packaging Supplier");
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition-all ${
                  role === "supplier"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Truck className="w-5 h-5 mb-1 text-primary" />
                <T k="business.weSupply" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setRole("both");
                  setBusinessType("Trading & Packaging");
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition-all ${
                  role === "both"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Building2 className="w-5 h-5 mb-1 text-primary" />
                <T k="business.both" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              <T k="business.name" />
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Apex Packaging / Global Trade Co."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              <T k="business.type" />
            </label>
            <input
              type="text"
              required
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                <T k="business.area" />
              </label>
              <input
                type="text"
                placeholder="e.g. Downtown / Central"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                <T k="business.city" />
              </label>
              <input
                type="text"
                placeholder="e.g. Dhaka / Dubai"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              <T k="business.detailedAddress" />
            </label>
            <input
              type="text"
              required
              placeholder="Road / Shop / House"
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              <T k="business.whatsapp" />
            </label>
            <input
              type="tel"
              placeholder="01XXXXXXXXX"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white font-medium rounded-xl hover:bg-primary-hover shadow-sm transition-all disabled:opacity-50 text-sm mt-4"
          >
            <CheckCircle2 className="w-4 h-4" />
            {loading ? <T k="common.loading" /> : <T k="business.submitCreate" />}
          </button>
        </form>
      </div>
    </div>
  );
}
