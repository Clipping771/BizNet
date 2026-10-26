import { getSession } from "@/lib/session";
import { PlatformRole, MemberRole } from "@prisma/client";
import { findUserMembership } from "@/lib/repo/membership";
import { findUserById } from "@/lib/repo/user";

export interface AuthedUserResult {
  user: Awaited<ReturnType<typeof findUserById>> | null;
  session: Awaited<ReturnType<typeof getSession>>;
  error: string | null;
  status: number;
}

/**
 * Validates the active session against the database.
 * If user does not exist or user.deletedAt is set (soft-deleted),
 * destroys the session and returns 401.
 */
export async function getAuthedUser(reqOrSession?: any): Promise<AuthedUserResult> {
  let session;
  if (reqOrSession && reqOrSession.isLoggedIn !== undefined) {
    session = reqOrSession;
  } else {
    session = await getSession(reqOrSession);
  }

  if (!session.isLoggedIn || !session.userId) {
    return { user: null, session, error: "Unauthorized", status: 401 };
  }

  const user = await findUserById(session.userId);
  if (!user || user.deletedAt !== null) {
    if (typeof session.destroy === "function") {
      session.destroy();
    }
    return {
      user: null,
      session,
      error: "User account has been deleted or deactivated",
      status: 401,
    };
  }

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const adminPhones = (process.env.ADMIN_PHONES || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (
    (user.email && adminEmails.includes(user.email.toLowerCase().trim())) ||
    (user.phone && adminPhones.includes(user.phone.trim()))
  ) {
    (user as any).role = "ADMIN";
    if (session.role !== "ADMIN") {
      session.role = "ADMIN";
    }
  }

  return { user, session, error: null, status: 200 };
}

export interface AuthzContextResult {
  user: NonNullable<AuthedUserResult["user"]> | null;
  session: AuthedUserResult["session"];
  ctx: {
    userId: string;
    role: PlatformRole;
    activeBusinessId: string | null;
    businessRole: MemberRole | null;
    phoneVerified: boolean;
    emailVerified: boolean;
  } | null;
  error: string | null;
  status: number;
}

/**
 * Builds the assertCan() context from the database: platform role from the User
 * row and business role from the Membership row. Session fields like role and
 * businessRole are hints for the UI only and are never trusted here.
 */
export async function getAuthzContext(reqOrSession?: any): Promise<AuthzContextResult> {
  const { user, session, error, status } = await getAuthedUser(reqOrSession);
  if (error || !user) {
    return { user: null, session, ctx: null, error: error || "Unauthorized", status };
  }

  let businessRole: MemberRole | null = null;
  let activeBusinessId: string | null = session.activeBusinessId || null;
  if (activeBusinessId) {
    const membership = await findUserMembership(user.id, activeBusinessId);
    businessRole = membership?.role ?? null;
    if (!membership) activeBusinessId = null;
  }

  return {
    user,
    session,
    ctx: {
      userId: user.id,
      role: user.role === PlatformRole.ADMIN ? PlatformRole.ADMIN : PlatformRole.USER,
      activeBusinessId,
      businessRole,
      phoneVerified: Boolean(user.phoneVerified),
      emailVerified: Boolean(user.emailVerified),
    },
    error: null,
    status: 200,
  };
}
