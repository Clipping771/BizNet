"use client";

import { useState } from "react";
import { Building2, ShoppingCart, Truck } from "lucide-react";
import { T, useT } from "@/components/ui/T";

const ROLES = [
  { value: "buyer", icon: ShoppingCart, k: "business.weBuy", type: "Restaurant / Café" },
  { value: "supplier", icon: Truck, k: "business.weSupply", type: "Packaging Supplier" },
  { value: "both", icon: Building2, k: "business.both", type: "Trading & Packaging" },
] as const;

export default function OnboardingPage() {
  const t = useT();
  const [role, setRole] = useState<"buyer" | "supplier" | "both">("buyer");
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState<string>(ROLES[0].type);
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
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
          area,
          city,
          addressLine,
          whatsapp,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t("common.tryAgain"));
      }

      const params = new URLSearchParams(window.location.search);
      const target = params.get("next") || params.get("redirect");
      if (target && target.startsWith("/") && !target.startsWith("//")) {
        window.location.href = target;
      } else {
        window.location.href = "/home";
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">
        <T k="business.setupTitle" />
      </h1>
      <p className="page-subtitle">
        <T k="business.setupSubtitle" />
      </p>

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <fieldset>
          <legend className="label">
            <T k="business.role" />
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map(({ value, icon: Icon, k, type }) => (
              <button
                key={value}
                type="button"
                aria-pressed={role === value}
                onClick={() => {
                  setRole(value);
                  setBusinessType(type);
                }}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 text-[13px] font-medium transition-colors ${
                  role === value ? "border-primary-700 bg-primary-50 text-primary-800" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                }`}
              >
                <Icon className="h-5 w-5" />
                <T k={k} />
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="business-name" className="label">
            <T k="business.name" />
          </label>
          <input id="business-name" type="text" required placeholder={t("business.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </div>

        <div>
          <label htmlFor="business-type" className="label">
            <T k="business.type" />
          </label>
          <input id="business-type" type="text" required value={businessType} onChange={(e) => setBusinessType(e.target.value)} className="input" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="business-area" className="label">
              <T k="business.area" />
            </label>
            <input id="business-area" type="text" required placeholder={t("business.areaPlaceholder")} value={area} onChange={(e) => setArea(e.target.value)} className="input" />
          </div>
          <div>
            <label htmlFor="business-city" className="label">
              <T k="business.city" />
            </label>
            <input id="business-city" type="text" required placeholder={t("business.cityPlaceholder")} value={city} onChange={(e) => setCity(e.target.value)} className="input" />
          </div>
        </div>

        <div>
          <label htmlFor="business-address" className="label">
            <T k="business.detailedAddress" />
          </label>
          <input id="business-address" type="text" required placeholder={t("business.addressPlaceholder")} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className="input" />
        </div>

        <div>
          <label htmlFor="business-whatsapp" className="label">
            <T k="business.whatsapp" />
          </label>
          <input id="business-whatsapp" type="tel" placeholder={t("business.whatsappPlaceholder")} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="input" />
        </div>

        <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full">
          {loading ? <T k="common.loading" /> : <T k="business.submitCreate" />}
        </button>
      </form>
    </div>
  );
}
