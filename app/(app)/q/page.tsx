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
    <div className="page space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">
            <T k="q.title" />
          </h1>
          <p className="page-subtitle">
            <T k="q.subtitle" />
          </p>
        </div>
        <Link
          href="/q/new"
          id="ask-question-btn"
          className="btn btn-primary btn-sm"
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
          className="input flex-1"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label={t("q.categoryLabel")}
          className="input w-36"
        >
          <option value="">{t("search.allCategories")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {t(`category.${c.slug}`)}
            </option>
          ))}
        </select>
      </form>

      <div id="question-list" className="space-y-3">
        {questions.map((item) => (
          <Link
            key={item.id}
            href={`/q/${item.id}`}
            data-question-title={item.title}
            className="block card card-link p-4.5 space-y-2.5"
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">{item.title}</p>
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-slate-500 dark:text-slate-400">
              <QuestionStatusChip status={item.status} />
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" />
                {t("q.answers", undefined, { n: item.answerCount })}
              </span>
              <span className="flex items-center gap-1">
                <ThumbsUp className="w-3.5 h-3.5" />
                {item.score}
              </span>
              {item.categorySlug && <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">{t(`category.${item.categorySlug}`)}</span>}
            </div>
          </Link>
        ))}
        {!loading && questions.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-[13px] text-slate-500 dark:text-slate-500">
              <T k="q.empty" />
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
