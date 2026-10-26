import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: string;
  phone?: string;
  email?: string;
  authMethod?: "PHONE" | "EMAIL" | "PASSKEY";
  passkeyChallenge?: string;
  activeBusinessId?: string;
  businessRole?: "OWNER" | "MANAGER" | "STAFF";
  role?: "USER" | "ADMIN";
  isLoggedIn: boolean;
}

export const defaultSession: SessionData = {
  isLoggedIn: false,
};

function getSessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CRITICAL SECURITY CONFIGURATION ERROR: SESSION_SECRET is strictly required in production!");
    }
    return "c8e6a1d4f2b903e7a5c1d8f2b4e6a901c8e6a1d4f2b903e7a5c1d8f2b4e6a901";
  }
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long");
  }
  return secret;
}

export const sessionOptions: SessionOptions = {
  password: getSessionPassword(),
  cookieName: "biznet_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
};

export async function getSession(customStoreOrReq?: any) {
  let store = customStoreOrReq;
  if (!store || store.cookies) {
    // Inside a request, always use next/headers cookies(): session.save() on a
    // NextRequest's cookies never reaches the browser. Outside a request scope
    // (tests calling route handlers directly) fall back to the request's cookies.
    try {
      store = await cookies();
    } catch {
      store = customStoreOrReq?.cookies ?? new Map<string, any>();
    }
  }
  const session = await getIronSession<SessionData>(store, sessionOptions);
  if (!session.isLoggedIn) {
    session.isLoggedIn = defaultSession.isLoggedIn;
  }
  return session;
}
