import { publicAppUrl } from "@/lib/app-url";
/**
 * lib/sms/messages.ts — outgoing SMS text in the recipient's language. English unless they chose Bangla;
 * other languages get English until their translations are written.
 */

export function newRequestSms(lang: string | null | undefined, title: string, code: string, appUrl = publicAppUrl() || ""): string {
  const link = `${appUrl.replace(/\/$/, "")}/requests/${code}`;
  return lang === "bn"
    ? `BizNet: নতুন কোটেশন অনুরোধ "${title}"। কোড: ${code}। কোট দিন: ${link}`
    : `BizNet: New quote request "${title}". Code: ${code}. Send your quote: ${link}`;
}

export function quoteReceivedSms(lang: string | null | undefined, title: string, total: string): string {
  return lang === "bn"
    ? `BizNet: আপনার অনুরোধ "${title}"-এর জন্য নতুন কোটেশন এসেছে (মোট ${total})। দেখতে অ্যাপে যান।`
    : `BizNet: New quote for your request "${title}" (total ${total}). Open the app to view it.`;
}
