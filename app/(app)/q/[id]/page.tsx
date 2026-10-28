"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { ThumbsUp, ThumbsDown, CheckCircle, Flag, ShoppingCart, X } from "lucide-react";
import { T, useT, useLang } from "@/components/ui/T";
import { QuestionStatusChip } from "@/components/discussion/QuestionStatusChip";
import { formatDate } from "@/lib/dates";
import { TranslatableText } from "@/components/ui/TranslatableText";

export default function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const lang = useLang();
  const [question, setQuestion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [answer, setAnswer] = useState("");
  const [answerBlocked, setAnswerBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<Record<string, boolean>>({});
  const [hideBuyCard, setHideBuyCard] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/questions/${id}`);
    setQuestion(res.ok ? await res.json() : null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    fetch("/api/auth/account")
      .then((r) => setLoggedIn(r.ok))
      .catch(() => setLoggedIn(false));
    try {
      setHideBuyCard(window.localStorage.getItem(`biznet:hideBuyCard:${id}`) === "1");
    } catch {
      setHideBuyCard(false);
    }
  }, [id, load]);

  const vote = async (targetType: "QUESTION" | "ANSWER", targetId: string, value: 1 | -1) => {
    setError(null);
    const res = await fetch("/api/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, value }),
    });
    if (!res.ok) {
      setError((await res.json()).error || t("common.tryAgain"));
      return;
    }
    await load();
  };

  const postAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAnswerBlocked(false);
    const res = await fetch(`/api/questions/${id}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: answer }),
    });
    const json = await res.json();
    if (res.status === 422 && json.blocked) {
      setAnswerBlocked(true);
      return;
    }
    if (!res.ok) {
      setError(json.error || t("common.tryAgain"));
      return;
    }
    setAnswer("");
    await load();
  };

  const markBest = async (answerId: string) => {
    const res = await fetch(`/api/questions/${id}/best-answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerId }),
    });
    if (!res.ok) setError((await res.json()).error || t("common.tryAgain"));
    await load();
  };

  const report = async (targetType: "QUESTION" | "ANSWER", targetId: string) => {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, reason: "USER_REPORT" }),
    });
    if (res.ok) setReported((prev) => ({ ...prev, [targetId]: true }));
  };

  const dismissBuyCard = () => {
    setHideBuyCard(true);
    try {
      window.localStorage.setItem(`biznet:hideBuyCard:${id}`, "1");
    } catch {
      // Per-viewer convenience only
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!question) {
    return (
      <div className="page p-6 text-center space-y-3">
        <p id="question-not-found" className="text-sm text-gray-600">
          <T k="q.notFound" />
        </p>
        <Link href="/q" className="text-primary text-sm font-bold underline">
          <T k="q.backToList" />
        </Link>
      </div>
    );
  }

  const author = question.authorName ?? t("q.anonymous");
  const isAuthor = question.isMine;
  const canBuy = question.categoryHasListings && question.category && !hideBuyCard && question.status !== "PENDING_REVIEW";

  return (
    <div className="page space-y-4">
      <Link href="/q" className="text-xs text-primary font-semibold">
        <T k="q.backToList" />
      </Link>

      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span id="question-status" data-status={question.status}>
            <QuestionStatusChip status={question.status} />
          </span>
          {question.category && <span className="text-xs text-gray-500">{t(`category.${question.category.slug}`)}</span>}
        </div>
        <h1 id="question-title-heading" className="text-base font-bold text-gray-900">
          {question.title}
        </h1>
        <TranslatableText
          entityType="QUESTION"
          entityId={question.id}
          field="body"
          text={question.body}
          sourceLang={question.lang}
          className="text-sm text-gray-700 whitespace-pre-wrap"
        />
        <p className="text-xs text-gray-400">
          {author}
          {" · "}
          {formatDate(question.createdAt, lang)}
        </p>
        {question.status === "PENDING_REVIEW" && (
          <p id="pending-review-notice" className="text-xs text-amber-800 bg-amber-50 rounded-xl p-2.5">
            <T k="q.pendingNotice" />
          </p>
        )}
        <VoteBar
          score={question.score}
          myVote={question.myVote}
          disabled={!loggedIn || isAuthor || question.status === "PENDING_REVIEW"}
          idPrefix="vote-question"
          onVote={(v) => vote("QUESTION", question.id, v)}
          onReport={loggedIn && !isAuthor ? () => report("QUESTION", question.id) : undefined}
          reported={reported[question.id]}
        />
      </div>

      {canBuy && (
        <div id="problem-request-card" className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-emerald-700 shrink-0" />
          <Link href={`/requests/new?category=${question.category.slug}`} className="flex-1 text-xs font-semibold text-emerald-800">
            <T k="q.needToBuy" />
          </Link>
          <button type="button" id="problem-request-dismiss" onClick={dismissBuyCard} aria-label={t("q.dismiss")} className="p-1">
            <X className="w-4 h-4 text-emerald-700" />
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="space-y-2" id="answer-list">
        <p className="text-xs font-bold text-gray-500">{t("q.answers", undefined, { n: question.answers.length })}</p>
        {question.answers.map((a: any) => (
          <div
            key={a.id}
            id={`answer-${a.id}`}
            className={`bg-white rounded-2xl border p-4 space-y-2 ${a.isAccepted ? "border-emerald-300" : "border-gray-100"}`}
          >
            {a.isAccepted && (
              <p className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                <T k="q.best" />
              </p>
            )}
            <TranslatableText
              entityType="ANSWER"
              entityId={a.id}
              field="body"
              text={a.body}
              sourceLang={a.lang}
              className="text-sm text-gray-800 whitespace-pre-wrap"
            />
            <p className="text-xs text-gray-400">
              {a.authorBusiness?.name ?? a.authorName}
              {" · "}
              {formatDate(a.createdAt, lang)}
            </p>
            <VoteBar
              score={a.score}
              myVote={a.myVote}
              disabled={!loggedIn || a.isMine}
              idPrefix={`vote-answer-${a.id}`}
              onVote={(v) => vote("ANSWER", a.id, v)}
              onReport={loggedIn && !a.isMine ? () => report("ANSWER", a.id) : undefined}
              reported={reported[a.id]}
            />
            {isAuthor && !a.isAccepted && (
              <button type="button" id={`best-answer-${a.id}`} onClick={() => markBest(a.id)} className="text-xs font-bold text-emerald-700">
                <T k="q.markBest" />
              </button>
            )}
          </div>
        ))}
      </div>

      {question.status !== "PENDING_REVIEW" &&
        (loggedIn ? (
          <form onSubmit={postAnswer} className="card p-4 space-y-2">
            <label htmlFor="answer-body" className="text-xs font-bold text-gray-700 block">
              <T k="q.yourAnswer" />
            </label>
            <textarea
              id="answer-body"
              rows={3}
              maxLength={5000}
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                setAnswerBlocked(false);
              }}
              className="w-full text-sm p-3 rounded-xl border border-gray-200"
            />
            {answerBlocked && (
              <p id="answer-selling-warning" className="text-xs text-amber-800 bg-amber-50 rounded-xl p-2.5">
                <T k="q.sellingWarning" />
              </p>
            )}
            <button
              type="submit"
              id="answer-submit"
              disabled={!answer.trim()}
              className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50"
            >
              <T k="q.postAnswer" />
            </button>
          </form>
        ) : (
          <Link href={`/login?next=/q/${id}`} className="block text-center text-xs font-bold text-primary py-3">
            <T k="q.loginToAnswer" />
          </Link>
        ))}
    </div>
  );
}

function VoteBar({
  score,
  myVote,
  disabled,
  idPrefix,
  onVote,
  onReport,
  reported,
}: {
  score: number;
  myVote: number;
  disabled: boolean;
  idPrefix: string;
  onVote: (value: 1 | -1) => void;
  onReport?: () => void;
  reported?: boolean;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 text-xs text-gray-600">
      <button
        type="button"
        id={`${idPrefix}-up`}
        disabled={disabled}
        onClick={() => onVote(1)}
        aria-label={t("q.voteUp")}
        className={`p-2 rounded-lg ${myVote === 1 ? "text-emerald-700 bg-emerald-50" : ""} disabled:opacity-40`}
      >
        <ThumbsUp className="w-4 h-4" />
      </button>
      <span id={`${idPrefix}-score`} className="font-semibold min-w-[1.5rem] text-center">
        {score}
      </span>
      <button
        type="button"
        id={`${idPrefix}-down`}
        disabled={disabled}
        onClick={() => onVote(-1)}
        aria-label={t("q.voteDown")}
        className={`p-2 rounded-lg ${myVote === -1 ? "text-rose-700 bg-rose-50" : ""} disabled:opacity-40`}
      >
        <ThumbsDown className="w-4 h-4" />
      </button>
      {onReport && (
        <button type="button" onClick={onReport} disabled={reported} className="ms-auto flex items-center gap-1 text-xs text-gray-400">
          <Flag className="w-3 h-3" />
          {reported ? t("q.reported") : t("q.report")}
        </button>
      )}
    </div>
  );
}
