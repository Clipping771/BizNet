"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { T, useT } from "@/components/ui/T";
import { QuestionStatusChip } from "@/components/discussion/QuestionStatusChip";

export default function AskQuestionPage() {
  const t = useT();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [categories, setCategories] = useState<Array<{ id: string; slug: string }>>([]);
  const [similar, setSimilar] = useState<any[]>([]);
  const [sellingBlocked, setSellingBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setCategories(d))
      .catch(() => {});
  }, []);

  // Similar questions while typing the title (debounced, no AI)
  useEffect(() => {
    if (title.trim().length < 3) {
      setSimilar([]);
      return;
    }
    const id = setTimeout(async () => {
      const res = await fetch(`/api/questions/similar?q=${encodeURIComponent(title.trim())}`);
      if (res.ok) setSimilar((await res.json()).questions || []);
    }, 300);
    return () => clearTimeout(id);
  }, [title]);

  // Editing after a selling warning clears it; submitting again re-checks
  useEffect(() => setSellingBlocked(false), [title, body]);

  const submit = async (submitAnyway: boolean) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, categoryId: categoryId || null, isAnonymous, submitAnyway }),
      });
      const json = await res.json();
      if (res.status === 422 && json.blocked) {
        setSellingBlocked(true);
        return;
      }
      if (res.status === 401) {
        router.push("/login?next=/q/new");
        return;
      }
      if (!res.ok) {
        setError(json.error || t("common.tryAgain"));
        return;
      }
      router.push(`/q/${json.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const titleOk = title.trim().length >= 10 && title.trim().length <= 150;

  return (
    <div className="max-w-md mx-auto space-y-4 pb-16">
      <Link href="/q" className="text-xs text-primary font-semibold">
        <T k="q.backToList" />
      </Link>
      <h1 className="text-lg font-bold text-gray-900">
        <T k="q.ask" />
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
        className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="question-title" className="text-xs font-bold text-gray-700 block">
            <T k="q.titleLabel" />
          </label>
          <input
            id="question-title"
            value={title}
            maxLength={150}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-sm p-3 rounded-xl border border-gray-200"
          />
          {similar.length > 0 && (
            <div id="similar-questions" className="bg-gray-50 rounded-xl p-3 space-y-1.5">
              <p className="text-[11px] font-bold text-gray-500">
                <T k="q.similar" />
              </p>
              {similar.map((s) => (
                <Link key={s.id} href={`/q/${s.id}`} className="flex items-center justify-between gap-2 text-xs text-gray-800">
                  <span className="truncate">{s.title}</span>
                  <QuestionStatusChip status={s.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="question-body" className="text-xs font-bold text-gray-700 block">
            <T k="q.bodyLabel" />
          </label>
          <textarea
            id="question-body"
            rows={5}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full text-sm p-3 rounded-xl border border-gray-200"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="question-category" className="text-xs font-bold text-gray-700 block">
            <T k="q.categoryLabel" />
          </label>
          <select
            id="question-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full text-sm p-3 rounded-xl border border-gray-200 bg-white"
          >
            <option value="">{t("q.noCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {t(`category.${c.slug}`)}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input id="question-anonymous" type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
          <span>
            <T k="q.postAnonymously" />
          </span>
        </label>

        {sellingBlocked && (
          <div id="selling-warning" className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
            <p className="text-xs text-amber-900 flex gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <T k="q.sellingWarning" />
            </p>
            <button
              type="button"
              id="question-submit-anyway"
              onClick={() => submit(true)}
              disabled={submitting}
              className="text-xs font-bold text-amber-900 underline"
            >
              <T k="q.submitAnyway" />
            </button>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          id="question-submit"
          disabled={submitting || !titleOk || !body.trim()}
          className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50"
        >
          {submitting ? t("common.loading") : t("q.post")}
        </button>
      </form>
    </div>
  );
}
