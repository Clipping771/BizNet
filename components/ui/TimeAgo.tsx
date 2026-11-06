"use client";

import { useLang } from "@/components/ui/T";
import { timeAgo } from "@/components/notifications/useNotificationText";
import { formatDate } from "@/lib/dates";

/** "2 hours ago" in the viewer's language; usable from server components. */
export function TimeAgo({ iso }: { iso: string }) {
  const lang = useLang();
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {timeAgo(iso, lang)}
    </time>
  );
}

/** A calendar date in the viewer's language. */
export function DateText({ iso }: { iso: string }) {
  const lang = useLang();
  return <time dateTime={iso}>{formatDate(iso, lang)}</time>;
}
