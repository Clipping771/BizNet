"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Plus, ThumbsUp } from "lucide-react";
import { T, useT } from "@/components/ui/T";
import { QuestionStatusChip } from "@/components/discussion/QuestionStatusChip";

export default function DiscussPage() {
  const t = useT();
  const [questions, setQuestions] = useState<any[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; slug: string }>>([]);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (categoryId) params.set("categoryId", categoryId);
    const res = await fetch(`/api/questions?${params}`);
    const json = await res.json();
    setQuestions(json.questions || []);
    setLoading(false);
  }, [q, categoryId]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setCategories(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  return (
    <div className="page space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <T k="q.title" />
        </h1>
        <Link
          href="/q/new"
          id="ask-question-btn"
          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold"
        >
          <Plus className="w-3.5 h-3.5" />
          <T k="q.ask" />
        </Link>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="flex gap-2"
      >
        <input
          id="question-search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("q.searchPlaceholder")}
          aria-label={t("q.searchPlaceholder")}
          className="flex-1 text-sm p-3 rounded-xl border border-gray-200"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label={t("q.categoryLabel")}
          className="w-32 text-xs p-2 rounded-xl border border-gray-200 bg-white"
        >
          <option value="">{t("search.allCategories")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {t(`category.${c.slug}`)}
            </option>
          ))}
        </select>
      </form>

      <div id="question-list" className="space-y-2">
        {questions.map((item) => (
          <Link
            key={item.id}
            href={`/q/${item.id}`}
            data-question-title={item.title}
            className="block card p-4 space-y-2"
          >
            <p className="text-sm font-semibold text-gray-900">{item.title}</p>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <QuestionStatusChip status={item.status} />
              <span className="flex items-center gap-0.5">
                <MessageSquare className="w-3 h-3" />
                {t("q.answers", undefined, { n: item.answerCount })}
              </span>
              <span className="flex items-center gap-0.5">
                <ThumbsUp className="w-3 h-3" />
                {item.score}
              </span>
              {item.categorySlug && <span>{t(`category.${item.categorySlug}`)}</span>}
            </div>
          </Link>
        ))}
        {!loading && questions.length === 0 && (
          <p className="text-center text-xs text-gray-400 py-8">
            <T k="q.empty" />
          </p>
        )}
      </div>
    </div>
  );
}
