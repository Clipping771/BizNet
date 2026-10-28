"use client";

import React from "react";
import { useT } from "@/components/ui/T";
import { AttributeSchema, AttributeFieldDefinition } from "@/lib/attributes";

interface AttributeFieldsProps {
  categorySlug: string;
  schema: AttributeSchema;
  values: Record<string, any>;
  onChange?: (values: Record<string, any>) => void;
  readOnly?: boolean;
  errors?: Record<string, string>;
}

export function AttributeFields({
  categorySlug,
  schema,
  values = {},
  onChange,
  readOnly = false,
  errors = {},
}: AttributeFieldsProps) {
  const t = useT();

  const handleFieldChange = (key: string, val: any) => {
    if (!onChange || readOnly) return;
    onChange({
      ...values,
      [key]: val,
    });
  };

  // Find archived/removed fields in existing values not present in active schema (A5)
  const schemaKeys = new Set((schema?.fields || []).map((f) => f.key));
  const archivedEntries = Object.entries(values).filter(
    ([k, v]) => !schemaKeys.has(k) && v !== undefined && v !== null && v !== ""
  );

  return (
    <div className="space-y-4">
      {(schema?.fields || []).map((field: AttributeFieldDefinition) => {
        const labelKey = `attr.${categorySlug}.${field.key}.label`;
        const val = values[field.key];
        const error = errors[field.key];

        return (
          <div key={field.key} className="flex flex-col space-y-1.5">
            <label className="text-sm font-medium text-slate-800 flex items-center gap-1">
              <span>{t(labelKey)}</span>
              {field.unit && (
                <span className="text-xs text-slate-500">
                  {field.unit}
                </span>
              )}
              {field.required && <span className="text-rose-500">·</span>}
            </label>

            {field.type === "text" && (
              <input
                type="text"
                value={val ?? ""}
                disabled={readOnly}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
              />
            )}

            {field.type === "number" && (
              <input
                type="number"
                min={field.min}
                max={field.max}
                value={val ?? ""}
                disabled={readOnly}
                onChange={(e) =>
                  handleFieldChange(
                    field.key,
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
              />
            )}

            {field.type === "select" && (
              <select
                value={val ?? ""}
                disabled={readOnly}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">{t("listing.selectCategory")}</option>
                {(field.options || []).map((opt) => {
                  const optKey = `attr.${categorySlug}.${field.key}.opt.${opt}`;
                  return (
                    <option key={opt} value={opt}>
                      {t(optKey)}
                    </option>
                  );
                })}
              </select>
            )}

            {field.type === "multiselect" && (
              <div className="flex flex-wrap gap-2 pt-1">
                {(field.options || []).map((opt) => {
                  const optKey = `attr.${categorySlug}.${field.key}.opt.${opt}`;
                  const currentList: string[] = Array.isArray(val) ? val : [];
                  const isChecked = currentList.includes(opt);

                  return (
                    <label
                      key={opt}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition border ${
                        isChecked
                          ? "bg-emerald-50 border-emerald-500 text-emerald-800"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      } ${readOnly ? "cursor-default opacity-80" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={readOnly}
                        onChange={(e) => {
                          if (e.target.checked) {
                            handleFieldChange(field.key, [...currentList, opt]);
                          } else {
                            handleFieldChange(
                              field.key,
                              currentList.filter((item) => item !== opt)
                            );
                          }
                        }}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{t(optKey)}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {field.type === "boolean" && (
              <div className="flex items-center gap-4 pt-1">
                <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name={`${categorySlug}-${field.key}`}
                    checked={val === true}
                    disabled={readOnly}
                    onChange={() => handleFieldChange(field.key, true)}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{t("common.yes")}</span>
                </label>
                <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name={`${categorySlug}-${field.key}`}
                    checked={val === false}
                    disabled={readOnly}
                    onChange={() => handleFieldChange(field.key, false)}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{t("common.no")}</span>
                </label>
              </div>
            )}

            {error && <span className="text-xs text-rose-500">{error}</span>}
          </div>
        );
      })}

      {/* Render removed/archived fields as read-only (A5) */}
      {archivedEntries.length > 0 && (
        <div className="pt-2 border-t border-slate-200 space-y-2">
          {archivedEntries.map(([archivedKey, archivedVal]) => (
            <div
              key={archivedKey}
              className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-slate-700 flex justify-between items-center"
            >
              <div>
                <span className="font-semibold text-amber-900 mr-2">{archivedKey}</span>
                <span>{archivedVal}</span>
              </div>
              <span className="text-xs font-medium bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded">
                {t("listing.archivedField")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
