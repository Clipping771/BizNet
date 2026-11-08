const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?=[:/]|$)/i;

/**
 * The app's public base URL, without a trailing slash. APP_URL wins; on Render, RENDER_EXTERNAL_URL
 * (set automatically, e.g. https://biznet-xxxx.onrender.com) is used when APP_URL is missing, or when
 * APP_URL still points at localhost (a leftover dev value), so passkeys, SMS links and signed file
 * links work without extra configuration.
 */
export function publicAppUrl(): string | undefined {
  const appUrl = (process.env.APP_URL || "").trim();
  const renderUrl = (process.env.RENDER_EXTERNAL_URL || "").trim();
  const url = appUrl && !(renderUrl && LOCAL_HOST.test(appUrl)) ? appUrl : renderUrl || appUrl;
  return url ? url.replace(/\/+$/, "") : undefined;
}

/** The public URL, or the local dev default. */
export function appUrlOrLocal(): string {
  return publicAppUrl() || "http://localhost:3000";
}
