"use client";

import { useCallback, useEffect, useState } from "react";
import { T, useT } from "@/components/ui/T";
import { adminFetch } from "@/components/admin/AdminNav";

interface Draft {
  id: string | null;
  slug: string;
  schema: string;
  units: string;
  sortOrder: string;
  isActive: boolean;
}

const toDraft = (c: any): Draft => ({
  id: c.id,
  slug: c.slug,
  schema: JSON.stringify(c.attributeSchema, null, 2),
  units: (c.defaultUnits || []).join(", "),
  sortOrder: String(c.sortOrder),
  isActive: c.isActive,
});

/** Category editor: attribute schema (validated on the server), units, order, active flag — audited. */
export default function AdminCategoriesPage() {
  const t = useT();
  const [categories, setCategories] = useState<any[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetch("/api/admin/categories");
    if (res.ok) setCategories(res.data.categories);
    else setMessage(res.status === 403 ? t("admin.forbidden") : res.error);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    let attributeSchema: unknown;
    try {
      attributeSchema = JSON.parse(draft.schema);
    } catch {
      setMessage(t("admin.categories.invalidJson"));
      return;
    }
    const body = {
      slug: draft.slug,
      attributeSchema,
      defaultUnits: draft.units.split(",").map((u) => u.trim()).filter(Boolean),
      sortOrder: Number(draft.sortOrder),
      isActive: draft.isActive,
    };
    const res = draft.id
      ? await adminFetch(`/api/admin/categories/${draft.id}`, { method: "PUT", body: JSON.stringify(body) })
      : await adminFetch("/api/admin/categories", { method: "POST", body: JSON.stringify(body) });
    setMessage(res.ok ? t("admin.saved") : res.error);
    if (res.ok) {
      setDraft(null);
      await load();
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setDraft({ id: null, slug: "", schema: '{\n  "fields": []\n}', units: "pcs", sortOrder: "100", isActive: true })}
        className="px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold"
      >
        <T k="admin.categories.new" />
      </button>
      {message && <p className="text-sm text-gray-700">{message}</p>}

      {draft && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2 text-xs">
          {!draft.id && (
            <label className="block space-y-1">
              <span className="text-gray-500">
                <T k="admin.categories.slug" />
              </span>
              <input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} className="w-full p-2 rounded-lg border border-gray-200 font-mono" />
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-gray-500">
              <T k="admin.categories.schema" />
            </span>
            <textarea rows={12} value={draft.schema} onChange={(e) => setDraft({ ...draft, schema: e.target.value })} className="w-full p-2 rounded-lg border border-gray-200 font-mono text-xs" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-gray-500">
                <T k="admin.categories.units" />
              </span>
              <input value={draft.units} onChange={(e) => setDraft({ ...draft, units: e.target.value })} className="w-full p-2 rounded-lg border border-gray-200" />
            </label>
            <label className="block space-y-1">
              <span className="text-gray-500">
                <T k="admin.categories.sortOrder" />
              </span>
              <input type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} className="w-full p-2 rounded-lg border border-gray-200" />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
            <span>
              <T k="admin.categories.active" />
            </span>
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold">
              <T k="admin.save" />
            </button>
            <button type="button" onClick={() => setDraft(null)} className="px-4 py-2 rounded-lg border border-gray-200 font-semibold">
              <T k="common.cancel" />
            </button>
          </div>
        </div>
      )}

      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => setDraft(toDraft(c))}
          className="w-full text-start card p-3 text-xs flex justify-between gap-2"
        >
          <span>
            <span className="font-semibold text-gray-900">{t(`category.${c.slug}`)}</span>
            <span className="ms-2 font-mono text-gray-400">{c.slug}</span>
          </span>
          <span className={c.isActive ? "text-emerald-700" : "text-gray-400"}>
            {c.attributeSchema?.fields?.length ?? 0}
            {" · "}
            {c._count.listings}
          </span>
        </button>
      ))}
    </div>
  );
}
