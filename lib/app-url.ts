/**
 * The app's public base URL, without a trailing slash. APP_URL wins; on Render, RENDER_EXTERNAL_URL
 * (set automatically, e.g. https://biznet-xxxx.onrender.com) is used when APP_URL is missing, so
 * passkeys, SMS links and signed file links work without extra configuration.
 */
export function publicAppUrl(): string | undefined {
  const url = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").trim();
  return url ? url.replace(/\/+$/, "") : undefined;
}

/** The public URL, or the local dev default. */
export function appUrlOrLocal(): string {
  return publicAppUrl() || "http://localhost:3000";
}
