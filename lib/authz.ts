import { MemberRole, PlatformRole } from "@prisma/client";

export interface AuthContext {
  userId: string;
  role: PlatformRole;
  activeBusinessId?: string | null;
  businessRole?: MemberRole | null;
  isBanned?: boolean;
  phoneVerified?: boolean;
  emailVerified?: boolean;
}

export type ActionType =
  | "business:create"
  | "business:edit"
  | "business:invite"
  | "business:transfer_ownership"
  | "listing:create"
  | "listing:edit"
  | "request:create"
  | "request:edit"
  | "request:cancel"
  | "quote:create"
  | "quote:revise"
  | "quote:withdraw"
  | "quote:accept"
  | "order:update_status"
  | "feedback:give"
  | "discussion:post"
  | "report:create"
  | "admin:access";

export class AuthorizationError extends Error {
  constructor(message: string = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * Checks if the context has permission for the specified action on the resource.
 * Throws AuthorizationError if forbidden.
 */
export function assertCan(
  ctx: AuthContext,
  action: ActionType,
  resource?: {
    businessId?: string;
    buyerBusinessId?: string;
    supplierBusinessId?: string;
    ownerUserId?: string;
    isSuspended?: boolean;
    verificationStatus?: string;
  }
): void {
  // Banned users are denied everything except reading public resources
  if (ctx.isBanned && action !== "report:create") {
    throw new AuthorizationError("Account is banned");
  }

  // Admins can perform admin actions and bypass operational checks
  if (action === "admin:access") {
    if (ctx.role !== PlatformRole.ADMIN) {
      throw new AuthorizationError("Admin access required");
    }
    return;
  }

  if (ctx.role === PlatformRole.ADMIN) {
    return;
  }

  switch (action) {
    case "business:create":
      if (!ctx.phoneVerified && !ctx.emailVerified) {
        throw new AuthorizationError("Verification (phone or email) required to create a business");
      }
      return;

    case "business:edit":
      if (
        !ctx.activeBusinessId ||
        ctx.activeBusinessId !== resource?.businessId ||
        (ctx.businessRole !== MemberRole.OWNER && ctx.businessRole !== MemberRole.MANAGER)
      ) {
        throw new AuthorizationError("Only OWNER or MANAGER can edit business profile");
      }
      return;

    case "business:invite":
    case "business:transfer_ownership":
      if (
        !ctx.activeBusinessId ||
        ctx.activeBusinessId !== resource?.businessId ||
        ctx.businessRole !== MemberRole.OWNER
      ) {
        throw new AuthorizationError("Only OWNER can manage members or transfer ownership");
      }
      return;

    case "listing:create":
    case "listing:edit":
      if (
        !ctx.activeBusinessId ||
        ctx.activeBusinessId !== resource?.businessId ||
        (ctx.businessRole !== MemberRole.OWNER && ctx.businessRole !== MemberRole.MANAGER)
      ) {
        throw new AuthorizationError("Only OWNER or MANAGER can manage listings");
      }
      if (
        resource?.verificationStatus !== "BASIC" &&
        resource?.verificationStatus !== "VERIFIED"
      ) {
        throw new AuthorizationError("Business must be BASIC or VERIFIED to manage listings");
      }
      return;

    case "request:create":
    case "request:edit":
    case "request:cancel":
      if (
        !ctx.activeBusinessId ||
        ctx.activeBusinessId !== resource?.buyerBusinessId ||
        !ctx.businessRole
      ) {
        throw new AuthorizationError("Must be a member of the buyer business to manage requests");
      }
      return;

    case "quote:create":
    case "quote:revise":
    case "quote:withdraw":
      if (
        !ctx.activeBusinessId ||
        ctx.activeBusinessId !== resource?.supplierBusinessId ||
        !ctx.businessRole
      ) {
        throw new AuthorizationError("Must be a member of the supplier business to manage quotes");
      }
      if (resource?.isSuspended) {
        throw new AuthorizationError("Suspended suppliers cannot quote");
      }
      return;

    case "quote:accept":
      if (
        !ctx.activeBusinessId ||
        ctx.activeBusinessId !== resource?.buyerBusinessId ||
        (ctx.businessRole !== MemberRole.OWNER && ctx.businessRole !== MemberRole.MANAGER)
      ) {
        throw new AuthorizationError("Only OWNER or MANAGER of the buyer business can accept quotes");
      }
      return;

    case "feedback:give":
      if (
        !ctx.activeBusinessId ||
        ctx.activeBusinessId !== resource?.buyerBusinessId ||
        !ctx.businessRole
      ) {
        throw new AuthorizationError("Must be a member of the buyer business to give feedback");
      }
      return;

    case "discussion:post":
      if (!ctx.phoneVerified) {
        throw new AuthorizationError("Phone verification required to participate in discussion");
      }
      return;

    case "report:create":
      if (!ctx.userId) {
        throw new AuthorizationError("Must be logged in to report");
      }
      return;

    default:
      throw new AuthorizationError("Unauthorized action");
  }
}
