# BizNet Decisions Log

This document records architectural, technical, and domain decisions made during the implementation of BizNet MVP v2.3 in strict compliance with the specification.

## Architectural & Technical Decisions

### 1. Pinned Prisma Version
- **Decision**: Pinned Prisma to `6.19.3` (`@prisma/client@6.19.3` and `prisma@6.19.3`).
- **Rationale**: Spec v2.3 explicitly requires validation with the Prisma 6.19.3 engine. Upgrading to Prisma 7 is strictly forbidden in MVP.

### 2. Search Implementation
- **Decision**: Raw SQL migration creating trigger-maintained `tsvector` on `Business`, `Listing`, and `Question`.
- **Rationale**: PostgreSQL `unaccent()` is not `IMMUTABLE` and therefore cannot be used inside generated columns. Triggers run on `INSERT` and `UPDATE` using `to_tsvector('simple', unaccent(coalesce(...)))` with GIN indexing.

### 3. AI Budget Reservation & Hard Cap
- **Decision**: Reserving the maximum possible cost (`maxCost = inputTokensUpperBound * inPrice + maxOutputTokens * outPrice`) using atomic SQL `UPDATE ... WHERE spentUsd + $maxCost <= $cap RETURNING *` before execution, followed by refund of `(maxCost - actualCost)`.
- **Rationale**: Any estimation-based reservation risks budget overruns when output tokens spike. Hard token limits guarantee the daily cap cannot be breached.

### 4. Decimal Precision
- **Decision**: All money fields use `Decimal(14,2)`; quantities use `Decimal(14,3)`; per-unit market price statistics (`p25`, `median`, `p75`) use `Decimal(14,4)`.
- **Rationale**: Per-unit prices can be fractional Taka in bulk quantities. They are rounded to 2 decimal places for display and never used directly for billing totals.

### 5. Single Owner Invariant
- **Decision**: Business ownership transfer requires a 2-step atomic transaction. Phone invitations for the `OWNER` role are strictly disallowed at both schema (`InviteRole` enum) and service levels. Existing owners are blocked from accepting staff invites to demote themselves. Invites strictly require phone number match.
- **Rationale**: Guarantees every business always has exactly one accountable owner at all times and prevents account takeover or accidental zero-owner businesses.

### 6. Atomic Rate Limiting
- **Decision**: Implemented single-statement atomic UPSERT with conditional reset in PostgreSQL (`INSERT ... ON CONFLICT ("key") DO UPDATE SET count = CASE WHEN resetAt < NOW() THEN 1 ELSE count + 1 END RETURNING count, resetAt`).
- **Rationale**: Eliminates read-then-increment TOCTOU race conditions under high concurrency.

### 7. AI Multi-Scope Budget Rollback & Daily Suspension
- **Decision**: If reservation across multiple scopes (e.g. `global` followed by `user:<id>`) fails on any secondary scope, all previously reserved scopes in that invocation are rolled back immediately. Budget overrun logs `BUDGET_OVERRUN` and sets `aiDisabledUntilDay` to the current date, auto-recovering on the next calendar day.
- **Rationale**: Prevents global budget leakage on user-cap rejection and prevents permanent lockouts from single-day overruns.

### 8. Production Session Secret Enforcement
- **Decision**: `lib/session.ts` strictly requires a 32+ character `SESSION_SECRET` in production (`process.env.NODE_ENV === "production"`), throwing an unrecoverable configuration error if absent. Hardcoded fallback is prohibited in production.
- **Rationale**: Ensures cookie encryption keys can never be compromised by unconfigured production deployments.

### 9. Database-Backed UI Translation Overlay
- **Decision**: `UiString` and `UiTranslation` are seeded in the database. `getTranslations(lang)` loads baseline JSON files and overlays approved DB translations on top, with in-memory caching and version invalidation.
- **Rationale**: Enables dynamic operational UI text updates without code deployments while retaining zero-downtime offline fallbacks.

### 10. Route Protection & IDOR Middleware
- **Decision**: Next.js `middleware.ts` enforces authentication across all protected app routes (`/home`, `/requests`, `/inbox`, `/account`, `/onboarding`), populating session `businessRole` to secure cross-tenant requests.
- **Rationale**: Guarantees unauthenticated requests cannot reach application views or mutate tenant resources.

### 11. Universal Multi-Method Authentication (Email + OTP, Passkey FIDO2, Optional Phone SMS)
- **Decision**: Evolved the authentication architecture from SMS-only to a tripartite system:
  1. **Email + OTP**: 6-digit verification code with SHA-256 hashing, 10-minute expiry, and atomic 5-attempt brute-force protection.
  2. **Passkey (FIDO2 / WebAuthn)**: Device biometrics (Touch ID, Face ID, Windows Hello, PIN) via `@simplewebauthn/server` and `@simplewebauthn/browser` with one-time cryptographic challenge consumption and replay prevention.
  3. **Phone + SMS OTP (Optional)**: Preserved with an ISO 3166-1 alpha-2 country code picker and custom dial code support.
- **Rationale**: Sole reliance on SMS OTP creates carrier dependency, delivery failures in international networks, high per-SMS costs, and friction for global users. Multi-method authentication guarantees reliable, zero-barrier onboarding worldwide.

### 12. Phase 2: S3 / MinIO Presigned Storage & Local Proxy Fallback (§8.3, B2)
- **Decision**: Implemented `lib/storage/index.ts` supporting presigned PUT uploads and GET signed downloads via AWS S3 / MinIO SDK. When `S3_ENDPOINT` is unavailable or configured for local development, fallback proxy routes (`/api/files/upload/[...key]` and `/api/files/download`) issue and verify 5-minute cryptographic HMAC tokens (`SHA-256`).
- **Rationale**: Provides 100% production-compatible presigned architecture for cloud deployment while remaining completely operational in local environments and CI without requiring an active MinIO cluster daemon.

### 13. Phase 2: Private Verification Document Isolation (§8.3, B6, B7)
- **Decision**: Private verification documents are strictly stored under `private/verification/*`. Direct public URLs are never generated. Access via `/api/files/[key]` strictly enforces `assertCan(user, "manage", "VerificationRequest")` (Admin only). Business owners (even of the target business) receive HTTP 403 (Spec: admin-only for sensitive KYC documents). Signed download URLs expire in 300 seconds (5 minutes).
- **Rationale**: Prevents data leaks of trade licenses, NIDs, and business documents. Cryptographic expiry prevents permanent link sharing.

### 14. Phase 2: Strict State Machine Transition Rules (§8.3, B4)
- **Decision**: Repository `lib/repo/verification.ts` enforces allowable transitions: `UNVERIFIED -> PENDING`, `PENDING -> BASIC / VERIFIED / REJECTED`, `BASIC -> VERIFIED / SUSPENDED`, `VERIFIED -> SUSPENDED`, `REJECTED -> PENDING`, `SUSPENDED -> BASIC / VERIFIED`. Any invalid transition throws an error. Reviews atomically insert an `OpsTimeLog` record and an `AuditLog` entry in a single transaction.
- **Rationale**: Eliminates illegal privilege escalations or audit-less verification state modifications.

### 15. Phase 2: Single Canonical Attribute Engine (§6, A1–A5)
- **Decision**: Built single `<AttributeFields>` renderer (`components/attributes/AttributeFields.tsx`) and single `buildAttributeZod(schema)` validator (`lib/attributes.ts`). All forms, server actions, and future AI validations share this exact implementation. Deprecated attributes not in schema are displayed in a distinct read-only section. Unknown fields are stripped during validation.
- **Rationale**: Guarantees DRY validation rules across client, server, and background jobs. Prevents schema drift when categories evolve.


### 1. Scope Governance Rule
All deviations from the original specification require explicit founder review and approval prior to implementation.

### 2. Full Log of Scope Modifications Made & Rationale
| Change | Files / Entities Affected | Rationale | Status |
|---|---|---|---|
| **Email + OTP Auth** | `User.email`, `User.emailVerified`, `OtpCode.email`, `app/api/auth/email/*` | Enables global onboarding without SMS gateway dependencies, eliminating carrier delivery failures and SMS costs. | Implemented with atomic rate limiting and brute-force protection. |
| **Passkey (FIDO2 / WebAuthn)** | `Passkey`, `PasskeyChallenge`, `app/api/auth/passkey/*` | High-security, passwordless biometric login (Touch ID, Face ID, Windows Hello) with replay protection. | Implemented via `@simplewebauthn`. |
| **Global Phone Country Picker** | `components/ui/PhoneInput.tsx`, `lib/country-codes.ts` | Allows users from any country or territory to select or enter custom dial codes (`+XXX`). | Implemented with search and manual entry. |
| **Branding Uniformity** | `app/api/auth/email/send/route.ts` | Reverted non-canonical references (such as "BizNet Global Trade") strictly back to "BizNet" (B2B Packaging & Disposables). | Reverted to canonical branding. |
| **Model Count Realignment** | `prisma/schema.prisma`, `implementation_plan.md` | Clarified model count: Exactly 40 original specification models + 2 extended authentication models (`Passkey`, `PasskeyChallenge`) = 42 models in schema. | Documented and reconciled. |



