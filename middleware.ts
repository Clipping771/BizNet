import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "./lib/session";

const PROTECTED_PREFIXES = [
  "/home",
  "/requests",
  "/inbox",
  "/account",
  "/onboarding",
  "/business",
  "/admin",
  "/q/new",
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for the API (§10): a browser always sends Origin on cross-site POST/PUT/PATCH/DELETE;
 * reject it unless it is this app. Requests without Origin (server-to-server, CI) rely on the
 * SameSite=Lax session cookie and their own auth (e.g. the eval-report token).
 */
function crossSiteMutation(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  const allowed = new Set<string>();
  for (const h of [req.headers.get("x-forwarded-host"), req.headers.get("host"), req.nextUrl.host]) if (h) allowed.add(h);
  try {
    if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).host);
  } catch {
    // ignore a malformed APP_URL
  }
  return !allowed.has(originHost);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (crossSiteMutation(req)) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
    return NextResponse.next();
  }
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isProtected && pathname !== "/login") {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  if (isProtected) {
    if (!session.isLoggedIn || !session.userId) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname === "/login" && session.isLoggedIn && session.userId) {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    "/home/:path*",
    "/requests/:path*",
    "/inbox/:path*",
    "/account/:path*",
    "/onboarding/:path*",
    "/business/:path*",
    "/admin/:path*",
    "/q/new",
    "/login",
    "/api/:path*",
  ],
};
