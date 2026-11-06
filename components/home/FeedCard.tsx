"use client";

import { useState } from "react";
import Link from "next/link";
import { SealCheck, Sparkle, X } from "@phosphor-icons/react";
import { T } from "@/components/ui/T";
import { TimeAgo } from "@/components/ui/TimeAgo";

export interface FeedStat {
  labelKey: string;
  value: React.ReactNode;
}

export interface FeedAction {
  href: string;
  labelKey: string;
  primary?: boolean;
  id?: string;
}

interface FeedCardProps {
  /** Avatar or icon tile shown at the top left. */
  lead: React.ReactNode;
  name: React.ReactNode;
  nameHref?: string;
  verified?: boolean;
  /** Small coloured label like "Trade request" or "New product". */
  kindKey: string;
  kindTone: string;
  meta?: React.ReactNode;
  at: string;
  title: string;
  titleHref: string;
  body?: React.ReactNode;
  media?: React.ReactNode;
  stats?: FeedStat[];
  actions: FeedAction[];
  id?: string;
  /** Algorithmic personalization metadata */
  isRecommended?: boolean;
  recommendationReasonKey?: string;
  recommendationReasonParam?: string;
  listingId?: string;
  categorySlug?: string;
  onDismiss?: (listingId: string) => void;
}

/** One post in the home feed: who, what, the key numbers, and what you can do about it. */
export function FeedCard({
  lead,
  name,
  nameHref,
  verified,
  kindKey,
  kindTone,
  meta,
  at,
  title,
  titleHref,
  body,
  media,
  stats,
  actions,
  id,
  isRecommended,
  recommendationReasonKey,
  recommendationReasonParam,
  listingId,
  categorySlug,
  onDismiss,
}: FeedCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const shown = (stats ?? []).filter((s) => s.value !== null && s.value !== undefined);

  const handleTrackClick = () => {
    if (listingId) {
      try {
        fetch("/api/telemetry/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "listing_click",
            props: { listingId, categorySlug },
          }),
        }).catch(() => {});
      } catch {
        // non-blocking
      }
    }
  };

  const handleDismiss = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDismissed(true);
    if (listingId) {
      try {
        fetch("/api/telemetry/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "dismiss_recommendation",
            props: { listingId, categorySlug },
          }),
        }).catch(() => {});
      } catch {}
    }
    if (onDismiss && listingId) {
      onDismiss(listingId);
    }
  };

  if (dismissed) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 transition-all animate-fade-up">
        <span><T k="algo.dismissed" /></span>
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="font-medium text-teal-700 hover:underline"
        >
          <T k="common.cancel" />
        </button>
      </div>
    );
  }

  return (
    <article id={id} className={`overflow-hidden rounded-2xl border bg-white transition-shadow ${
      isRecommended ? "border-teal-200/90 shadow-sm shadow-teal-700/5 ring-1 ring-teal-500/10" : "border-slate-200"
    }`}>
      {/* Personalized Algorithmic Banner */}
      {isRecommended && (
        <div className="flex items-center justify-between border-b border-teal-100/70 bg-teal-50/60 px-4 py-1.5 text-[11px] font-medium text-teal-900">
          <div className="flex items-center gap-1.5 truncate">
            <Sparkle size={13} weight="fill" className="shrink-0 text-teal-700" />
            <span className="font-semibold text-teal-800"><T k="algo.badge" /></span>
            {recommendationReasonKey && (
              <>
                <span className="text-teal-400">·</span>
                <span className="truncate text-teal-700">
                  <T k={recommendationReasonKey} params={recommendationReasonParam ? { category: recommendationReasonParam, area: recommendationReasonParam } : undefined} />
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            title="Show less like this"
            className="ms-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-teal-600 hover:bg-teal-100/70 hover:text-teal-900 transition-colors"
          >
            <X size={12} weight="bold" />
            <span className="sr-only"><T k="algo.dismiss" /></span>
          </button>
        </div>
      )}

      <header className="flex items-start gap-3 px-5 pt-4">
        {lead}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {nameHref ? (
              <Link href={nameHref} className="truncate text-[15px] font-semibold text-slate-900 hover:underline">
                {name}
              </Link>
            ) : (
              <span className="truncate text-[15px] font-semibold text-slate-900">{name}</span>
            )}
            {verified && <SealCheck size={16} weight="fill" className="shrink-0 text-teal-700" />}
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${kindTone}`}>
              <T k={kindKey} />
            </span>
          </div>
          <p className="truncate text-[13px] text-slate-500">
            {meta}
            {meta ? " · " : ""}
            <TimeAgo iso={at} />
          </p>
        </div>
      </header>

      <div className="px-5 pt-3">
        <Link
          href={titleHref}
          onClick={handleTrackClick}
          className="block text-base font-semibold leading-snug text-slate-900 hover:text-teal-800"
        >
          {title}
        </Link>
        {body && <div className="mt-1 text-sm text-slate-600">{body}</div>}
      </div>

      {media && <div className="mt-3 px-5">{media}</div>}

      {shown.length > 0 && (
        <dl className="mx-5 mt-4 grid divide-x divide-slate-200 rounded-xl bg-slate-50 py-3" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
          {shown.map((s) => (
            <div key={s.labelKey} className="min-w-0 px-3 text-center">
              <dt className="truncate text-xs text-slate-500">
                <T k={s.labelKey} />
              </dt>
              <dd className="mt-0.5 truncate text-[15px] font-semibold tabular-nums text-slate-900">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <footer className="flex flex-wrap gap-2 px-5 pb-4 pt-4">
        {actions.map((a) => (
          <Link
            key={a.href + a.labelKey}
            id={a.id}
            href={a.href}
            onClick={handleTrackClick}
            className={`btn ${a.primary ? "btn-primary" : "btn-secondary"}`}
          >
            <T k={a.labelKey} />
          </Link>
        ))}
      </footer>
    </article>
  );
}
