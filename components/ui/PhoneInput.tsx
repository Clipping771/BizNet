"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { COUNTRIES, Country } from "@/lib/countries";
import { ChevronDown, Search, Globe, Check, Edit3 } from "lucide-react";
import { T, useT } from "@/components/ui/T";

interface PhoneInputProps {
  value: string;
  onChange: (fullPhone: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
}

export function PhoneInput({
  value,
  onChange,
  disabled = false,
  required = false,
  id = "phone-input",
  className = "",
}: PhoneInputProps) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  // International app: no country is assumed until the user picks one or types +<code>
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customDial, setCustomDial] = useState("+");
  const [localNumber, setLocalNumber] = useState("");

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initialize or synchronize from external value
  useEffect(() => {
    if (!value) return;

    if (value.startsWith("+")) {
      // Find matching country with longest dial code
      const matched = COUNTRIES.slice()
        .sort((a, b) => b.dial.length - a.dial.length)
        .find((c) => value.startsWith(c.dial));

      if (matched) {
        setSelectedCountry(matched);
        setIsCustomMode(false);
        setLocalNumber(value.slice(matched.dial.length));
      } else {
        // Custom country code
        const dialMatch = value.match(/^(\+\d{1,4})/);
        if (dialMatch) {
          setIsCustomMode(true);
          setCustomDial(dialMatch[1]);
          setLocalNumber(value.slice(dialMatch[1].length));
        } else {
          setLocalNumber(value.replace(/^\+/, ""));
        }
      }
    } else {
      // Local number without country code
      setLocalNumber(value.replace(/^0+/, ""));
    }
  }, [value]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const emitChange = (dial: string, number: string) => {
    const cleanNumber = number.replace(/[^\d]/g, "");
    const cleanDial = dial.startsWith("+") ? dial : `+${dial.replace(/[^\d]/g, "")}`;
    onChange(`${cleanDial}${cleanNumber}`);
  };

  const handleSelectCountry = (country: Country) => {
    setSelectedCountry(country);
    setIsCustomMode(false);
    setIsOpen(false);
    setSearch("");
    emitChange(country.dial, localNumber);
  };

  const handleSelectCustomMode = () => {
    setIsCustomMode(true);
    setIsOpen(false);
    setSearch("");
    emitChange(customDial, localNumber);
  };

  const handleCustomDialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d+]/g, "");
    if (!raw.startsWith("+")) {
      raw = `+${raw.replace(/\+/g, "")}`;
    }
    setCustomDial(raw);
    emitChange(raw, localNumber);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // "+<code>..." typed straight into the number box picks the country by its dial code
    if (raw.trim().startsWith("+")) {
      const digits = "+" + raw.replace(/[^\d]/g, "");
      const matched = COUNTRIES.slice()
        .sort((a, b) => b.dial.length - a.dial.length)
        .find((c) => digits.startsWith(c.dial));
      if (matched) {
        setSelectedCountry(matched);
        setIsCustomMode(false);
        setLocalNumber(digits.slice(matched.dial.length));
      } else {
        setLocalNumber(raw);
      }
      onChange(digits);
      return;
    }
    setLocalNumber(raw);
    if (isCustomMode) emitChange(customDial, raw);
    else if (selectedCountry) emitChange(selectedCountry.dial, raw);
    else onChange("");
  };

  const needsCountry = !isCustomMode && !selectedCountry && localNumber.trim().length > 0;

  const filteredCountries = useMemo(() => {
    const all = COUNTRIES.slice().sort((x, y) => x.name.localeCompare(y.name));
    if (!search.trim()) return all;
    const q = search.toLowerCase().trim();
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.dial.includes(q)
    );
  }, [search]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div className="flex h-12 items-center overflow-visible rounded-xl border border-slate-300 bg-white shadow-2xs transition-all hover:border-slate-400 focus-within:border-primary-600 focus-within:ring-2 focus-within:ring-primary-600/20">
        {/* Country Picker Trigger or Custom Dial Input */}
        {isCustomMode ? (
          <div className="flex items-center border-e border-slate-200 ps-2.5 pe-1 bg-slate-100/70 rounded-s-xl">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="p-1 text-slate-500 hover:text-primary-700 transition-colors"
              title={t("auth.selectCountry")}
            >
              <Globe className="w-4 h-4 text-primary-700" />
            </button>
            <input
              type="text"
              value={customDial}
              onChange={handleCustomDialChange}
              placeholder={"+..."}
              maxLength={6}
              className="w-14 px-1 py-2 text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="px-1 text-slate-500 hover:text-slate-600"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(!isOpen)}
            className="flex shrink-0 items-center gap-2 self-stretch border-e border-slate-200 bg-slate-50 px-3 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            {selectedCountry ? (
              <>
                <span className="text-base leading-none select-none">{selectedCountry.flag}</span>
                <span className="font-mono text-slate-900 font-bold">{selectedCountry.dial}</span>
              </>
            ) : (
              <>
                <Globe className="h-4 w-4 text-slate-500" />
                <span className="text-slate-600">{t("auth.country")}</span>
              </>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>
        )}

        {/* Local Phone Number Input */}
        <input
          id={id}
          type="tel"
          required={required}
          disabled={disabled}
          value={localNumber}
          onChange={handleNumberChange}
          placeholder={t("auth.phoneNumberPlaceholder")}
          aria-invalid={needsCountry || undefined}
          aria-describedby={needsCountry ? `${id}-hint` : undefined}
          className="flex-1 w-full px-3 py-2.5 text-sm bg-transparent focus:outline-none text-slate-900 placeholder:text-slate-400 font-medium"
        />
      </div>

      {needsCountry && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-amber-700">
          {t("auth.pickCountryHint")}
        </p>
      )}

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute start-0 top-full mt-1.5 w-72 max-w-[90vw] bg-white rounded-xl shadow-2xl border border-slate-100 z-50 overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-100">
          {/* Search Box */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/70">
            <div className="relative">
              <Search className="absolute start-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("auth.searchCountry")}
                className="input"
              />
            </div>
          </div>

          {/* Custom Dial Code Option */}
          <div className="p-1 border-b border-slate-100 bg-primary/5">
            <button
              type="button"
              onClick={handleSelectCustomMode}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-start hover:bg-primary/10 text-primary font-semibold transition-colors"
            >
              <div className="flex items-center gap-2">
                <Edit3 className="w-3.5 h-3.5" />
                <span>
                  <T k="auth.customCountry" />
                </span>
              </div>
              <span className="font-mono text-xs text-slate-500">
                <T k="auth.customDialCodePlaceholder" />
              </span>
            </button>
          </div>

          {/* Country List */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-50 p-1">
            {filteredCountries.length === 0 ? (
              <div className="py-6 text-center text-slate-500">
                <span>
                  <T k="common.error" />
                </span>
              </div>
            ) : (
              filteredCountries.map((c) => {
                const isSelected =
                  !isCustomMode && selectedCountry?.code === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleSelectCountry(c)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-start hover:bg-slate-50 transition-colors ${
                      isSelected ? "bg-primary/5 text-primary font-bold" : "text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate me-2">
                      <span className="text-base leading-none shrink-0">
                        {c.flag}
                      </span>
                      <span className="truncate">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono text-xs text-slate-500 font-medium">
                        {c.dial}
                      </span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-primary" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
