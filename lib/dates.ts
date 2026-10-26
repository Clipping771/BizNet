import { toBanglaDigits } from "./money";

const DHAKA_TIMEZONE = "Asia/Dhaka";

/**
 * Returns the current date in Asia/Dhaka timezone formatted as YYYY-MM-DD
 */
export function getDhakaDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/**
 * Formats a date for display in the given locale.
 */
export function formatDate(
  date: Date | string | null | undefined,
  locale: string = "bn",
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;

  const defaultOpts: Intl.DateTimeFormatOptions = {
    timeZone: DHAKA_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  };

  const formatted = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", defaultOpts).format(d);
  return formatted;
}

/**
 * Resolves relative date chips: "today", "tomorrow", "3_days", "1_week" to a Date in Asia/Dhaka.
 */
export function resolveRelativeDate(chip: string, baseDate: Date = new Date()): Date {
  const target = new Date(baseDate);
  switch (chip) {
    case "today":
      break;
    case "tomorrow":
      target.setDate(target.getDate() + 1);
      break;
    case "3_days":
      target.setDate(target.getDate() + 3);
      break;
    case "1_week":
      target.setDate(target.getDate() + 7);
      break;
    default:
      // Try to parse as ISO string
      const parsed = new Date(chip);
      if (!isNaN(parsed.getTime())) return parsed;
  }
  return target;
}
