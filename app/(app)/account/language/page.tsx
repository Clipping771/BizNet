"use client";

import { useState } from "react";
import { Check, Globe } from "lucide-react";
import { T } from "@/components/ui/T";

export default function LanguagePage() {
  const [selected, setSelected] = useState("bn");

  const languages = [
    { code: "bn", nameNative: "বাংলা", nameEnglish: "Bengali", status: "ACTIVE" },
    { code: "en", nameNative: "English", nameEnglish: "English", status: "ACTIVE" },
    { code: "ar", nameNative: "العربية", nameEnglish: "Arabic (RTL Preview)", status: "DRAFT" },
  ];

  const handleSelect = (code: string) => {
    setSelected(code);
    if (code === "ar") {
      document.documentElement.setAttribute("dir", "rtl");
      document.documentElement.setAttribute("lang", "ar");
    } else {
      document.documentElement.setAttribute("dir", "ltr");
      document.documentElement.setAttribute("lang", code);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-gray-900">
          <T k="common.language" />
        </h2>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        {languages.map((l) => (
          <button
            key={l.code}
            onClick={() => handleSelect(l.code)}
            className="w-full flex items-center justify-between p-4 text-start hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="font-semibold text-sm text-gray-900">{l.nameNative}</p>
              <p className="text-xs text-gray-500">
                <span>{l.nameEnglish}</span>
                {l.status === "DRAFT" && (
                  <span className="ms-2 px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800 rounded font-mono">
                    <T k="common.draft" />
                  </span>
                )}
              </p>
            </div>
            {selected === l.code && <Check className="w-5 h-5 text-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}
