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
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
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
    "/login",
  ],
};
