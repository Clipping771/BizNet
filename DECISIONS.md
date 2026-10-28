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




## Phase 2 storage decisions (post-review)

| Decision | Where | Why |
|---|---|---|
| Uploads go through the app with HMAC-signed tickets instead of browser-to-S3 presigned PUTs | `lib/storage/index.ts`, `app/api/files/upload/**` | One code path for MinIO, R2 and tests; the ticket binds key, content type, size, expiry and user, and the app enforces size while streaming. Files still land in the S3 public/private buckets (§4). |
| `STORAGE_DRIVER=memory` only by explicit opt-in | `lib/storage/index.ts` | Tests and machines without MinIO. Refused on non-localhost production so files can never silently live in RAM. |
| BASIC/VERIFIED businesses keep their level while an upgrade request is pending | `lib/repo/verification.ts` | Asking for VERIFIED must not remove the BASIC badge or listing rights (§8.3). |

## Phase 3 decisions (post-review)

| Decision | Where | Why |
|---|---|---|
| Quote and message attachments are stored under `private/quotes/<bizId>/` and `private/messages/<bizId>/`; only the deal's buyer and supplier (and admins) get a signed URL | `lib/storage/index.ts`, `app/api/files/[...key]/route.ts` | They are private between two businesses; the public bucket would expose them to anyone with the link. Request photos stay public (suppliers browsing the inbox must see them). |
| Every stored file key is checked to belong to the acting business and purpose (`assertBusinessFileKeys`) | quotes, messages, requests | A record must never point at another business's file (e.g. a verification document). |
| Spec match is stored as `{ field: MATCH \| DIFFERENT \| NOT_STATED, _offered: { field: value } }`; skipped comparable fields become NOT_STATED | `lib/repo/quote.ts` | Keeps the pure priority/validation functions comparing plain strings while recording the offered value the spec asks for (§8.7). |
| A supplier can quote / message only if invited, or (for non-direct requests) if it serves the category; a direct re-order request accepts only the previous supplier | `lib/repo/quote.ts`, `lib/repo/messaging.ts`, `lib/repo/request.ts` | Resource-level authorization (§4); `directSupplierId` is accepted only from a completed order being repeated. |
| "Late" is computed on Asia/Dhaka calendar days (arrival day > needed-by day) | `lib/compare/priority.ts` | Time of day must not make an on-the-day delivery "late". |
| Accept claims the request with `updateMany(status = OPEN)`; order transitions use `updateMany(status = from)` | `lib/repo/quote.ts`, `lib/repo/order.ts` | Concurrent accepts of different quotes and double taps on transitions apply exactly once. |
| An AI cache hit creates its own `AiInteraction` row (cost 0, `cacheHit = true`) for the user | `lib/ai/requestAssistant.ts` | Each request records its own outcome (ACCEPTED_AS_IS / EDITED / DISCARDED) even when the structuring came from cache. |
| Re-order creates the new request immediately after the buyer picks "Only from {supplier}" or "Everyone" | `app/(app)/orders/[code]/page.tsx` | The explicit choice is the buyer's confirmation; the prefilled data is the order snapshot's request. "Create a new request from this" (after cancellation) opens the wizard prefilled instead. |
| `QUOTE_COMPARISON` outcome is set on accept (ACCEPTED_AS_IS if the suggested quote was ordered, else EDITED); DISCARDED for requests that end without an order is not yet written | `lib/repo/quote.ts` | Known gap — to be filled by the expire-requests job in Phase 5 with the metrics work. |

## Phase 4 decisions

| Decision | Where | Why |
|---|---|---|
| Search expands a small Bangla↔English synonym list (box/বক্স, cup/কাপ, …) and Bangla↔Latin digits; a one-word query that names a category also returns that category's listings | `lib/search/query.ts`, `lib/repo/search.ts` | Listings are written in Bangla; "box" must find "বক্স". No AI, no vector search (§2 LATER). |
| "Verified only" (default on) shows VERIFIED suppliers; off shows BASIC and VERIFIED. Unverified suppliers never appear | `lib/repo/search.ts` | Same public rule as listing pages (Phase 2); the toggle stays meaningful. |
| Ranking = ts_rank + trigram similarity + 0.3 VERIFIED / 0.15 BASIC + 0.2 if the supplier has active listings; offset paging of 20 | `lib/repo/search.ts` | §8.13 ranking ingredients with fixed, testable weights. |
| Selling answers are refused with the warning (must be edited); selling questions can be submitted anyway and are held as PENDING_REVIEW | `lib/repo/discussion.ts` | Answers have no review state in the schema; questions do (§8.14). |
| Rejected held questions become CLOSED + soft-deleted; approvals and rejections are audited | `lib/repo/discussion.ts` | Moderation actions need an audit trail (§10). |
| Price inputs: SUPPLIER quotes in SUBMITTED / REVISED / ACCEPTED / REJECTED (not chosen) from the last 30 days; WITHDRAWN never; fraud handled by admin exclusions | `lib/repo/pricing.ts` | Dropping every not-chosen quote would discard most real prices; "REJECTED-for-fraud" is what MarketPriceExclusion is for. |
| A quote counts only if every comparable field the buyer specified is MATCH; spec key = those fields sorted; prices are per the request's unit (unit is part of the group) | `jobs/compute-market-prices.ts` | "Spec known" without inventing unit conversions. |
| Quantity bands 1-99 / 100-499 / 500-999 / 1000-4999 / 5000+; deliveryIncluded = delivery charge 0 | `lib/pricing/compute.ts` | Simple, documented grouping (§8.15). |
| Dominant supplier (> 40%) is collapsed to its median first, then IQR fences are applied | `lib/pricing/compute.ts` | Collapsing first keeps one supplier's many quotes from shifting the quartiles used for the fences. |
| Each job run writes one snapshot batch (same `computedAt`); `/prices` reads the latest batch | `lib/repo/pricing.ts` | Keeps history for admin review without a separate table. |
| The seed creates recent quotes and runs the real job instead of inserting hand-made snapshots | `prisma/seed.ts` | "Seed produces one publishable and one non-publishable group" is then proven by the job itself. |
| `directSupplierId` may be any active supplier (search card "only this supplier"), not only a previous order's supplier | `lib/repo/request.ts` | §8.13 card CTA; matching still applies eligibility. |
| pg-boss worker added (`pnpm worker`) for expire-requests, auto-complete-orders and compute-market-prices | `jobs/worker.ts` | Phase 3 jobs existed as functions but nothing scheduled them. |
| Playwright runs one worker | `playwright.config.ts` | Specs share one seeded database; some pause suppliers while running. |

## Phase 5 decisions

| Decision | Where | Why |
|---|---|---|
| Funnel cohort = requests created in the range; later steps (quotes, orders) follow those requests even after the range end. Orders, feedback, AI, ops and events count by their own timestamp in the range | `lib/repo/metrics.ts` | Each funnel step stays a separate, reproducible number (§13). |
| "Active at 60/90 days" = buyers whose first request is in the range and who created another request ≥ 60 / ≥ 90 days later; "second request" = within 30 days of the first | `lib/repo/metrics.ts` | Simplest testable reading of the retention metrics. |
| Percentages are `null` (shown "—") when the denominator is 0; the requests target (20 / 4 weeks) is scaled to the selected range | `lib/metrics/math.ts`, `lib/repo/metrics.ts` | Avoids fake 0% and unfair thresholds on short ranges. |
| Thresholds and the latest eval report live in Settings (`metricThresholds`, `latestEvalReport`) | `lib/settings.ts` | Editable without deploys; no new tables. |
| Nightly eval workflow posts to `POST /api/admin/eval-report` with `EVAL_REPORT_TOKEN`; below-threshold results notify every admin in-app | `app/api/admin/eval-report`, `lib/repo/admin.ts` | §12: report reaches /admin without a user session; alert the admin. |
| Critical UI keys = navigation, auth, common and the whole core loop (rfq/quote/order/msg/feedback/cmp/enum labels) | `lib/i18n-critical.ts` | ACTIVE needs ≥ 90% of these approved (§11). |
| Served languages come from the Language table: ACTIVE for everyone, DRAFT/BETA admin-only preview, DISABLED never; direction from the language row | `app/layout.tsx` | Replaces the hard-coded "ar" guard so new languages need no code change. |
| Auto-draft never overwrites existing (builtin/human) text, keeps English placeholders if a provider mangles them, and leaves drafts unapproved | `lib/repo/languages.ts` | Machine text must be reviewed before users see it. |
| Settings are typed by the default value's shape (number / boolean / string / list / object) | `lib/repo/admin.ts` | Prevents a mistyped value from breaking a feature (§9). |
| CSV export quotes every cell and prefixes `= + - @` with `'` | `lib/repo/admin.ts` | Prevents spreadsheet formula injection from user text. |
| Per-route mutation rate limits (per user, or per IP when logged out) in addition to existing OTP/message/AI limits | `lib/http/guard.ts`, API routes | §10 "every mutation: rate limit". |
| CSRF: middleware rejects API mutations whose `Origin` is not this app; requests without Origin rely on the SameSite=Lax cookie plus their own auth | `middleware.ts` | §10 origin check without breaking CI/server callers. |
| Quote submit and order confirm are idempotent (same idempotency key → stored quote; repeated confirm → existing order) | `lib/repo/quote.ts` | §10 idempotency for commercial mutations. |
| User text is stripped of control and bidi-override characters (ZWJ/ZWNJ kept for Bangla) and always rendered as plain text | `lib/http/guard.ts` | No HTML; prevents hidden-text tricks (§10). |
| docker compose uses moto for S3 (MinIO image no longer on Docker Hub); objects are in memory | `docker-compose.yml` | Same S3 server as CI; production uses R2/S3. A CI job proves `docker compose up` + `pnpm db:seed` works. |

## Phase 6 decisions (READY features, switched off by default)

| Decision | Where | Why |
|---|---|---|
| Founder chose: build lead credits/payments, content translation and the extra-language flow completely, but keep `leadCreditsEnabled` and `translationEnabled` **off** until an admin switches them on | `lib/settings.ts` | MVP stays free (§1); switching on is a business decision, not a deploy. |
| Free trial (`freeTrialCredits`, default 5) is granted once to a verified supplier (BASIC/VERIFIED) the first time credits matter, under the same advisory lock as spending | `lib/repo/credits.ts` | No credits for unverified businesses; no double grants under concurrency. |
| Only the first quote on a request costs a credit; revisions and re-submits are free; out of credits → HTTP 402 `INSUFFICIENT_CREDITS` | `lib/repo/quote.ts`, quote route | §8.7; the UI links to the credits page. |
| Payments are manual: supplier reports bKash/Nagad TrxID + sender number for a credit pack; admin verifies and approves; TrxID is unique; approval is claimed atomically so credits are added exactly once | `lib/repo/credits.ts` | §2 F23 (no payment gateway in MVP). Merchant numbers come from the `paymentReceivers` setting. |
| Only OWNER/MANAGER can submit payments | `app/api/credits/payments` | Spending company money is a manager action. |
| Content translation loads the text on the server and checks the viewer may read it (message parties, quote parties, request readers, public Q&A) | `lib/repo/content-translation.ts` | A user can never translate (and so read) content they cannot see. |
| Numbers, units and money are masked before translation and restored exactly; if a provider drops or duplicates a token the original is shown | `lib/translation/protect.ts` | §1 "numbers are never translated by AI". |
| Translation budget: full cost reserved up front per call against `translationDailyBudgetUsd` (same atomic counter as AI) + 200 translations/user/day; results cached by source hash | `lib/repo/content-translation.ts` | Hard daily cap; repeated views cost nothing. |
| Real adapter: DeepL (`TRANSLATION_PROVIDER=deepl`, `TRANSLATION_API_KEY`); mock otherwise | `lib/translation/provider.ts` | §3 lists deepl; unsupported language pairs fall back to the original. |
| The language picker lists languages from the database (ACTIVE; admins also see DRAFT/BETA) and stores the choice in the `biznet_lang` cookie and on the user | `app/api/languages`, `app/api/account/language` | The old picker only changed the page's `lang` attribute and was lost on navigation. |

## UI redesign decisions

| Decision | Where | Why |
|---|---|---|
| Responsive shell: phones keep the 5-tab bottom bar; from `lg` a fixed sidebar (primary nav, trade, business, admin) and a header search box replace it; the content column is no longer a 640px phone frame on desktop | `components/layout/*` | Buyers and suppliers also work from a desktop; the phone frame wasted most of the screen. |
| Landing, sign-in and onboarding render without the app chrome; sign-in/onboarding use a split layout with the value proposition on the left from `lg` | `app/(auth)/layout.tsx`, `app/page.tsx` | First impression for new businesses; forms stay focused. |
| Design tokens in Tailwind (slate neutrals, emerald brand scale, card/raised/pop shadows) and shared component classes (`card`, `btn-*`, `input`, `label`, `page`, `page-title`) in `globals.css` | `tailwind.config.ts`, `app/globals.css` | One visual language instead of per-page ad-hoc classes. |
| Inter for Latin + Hind Siliguri for Bangla via `next/font` (self-hosted at build time) | `app/layout.tsx` | Consistent, legible Bangla on every device; no runtime font requests. |
| Minimum body text 12px (former 10–11px text raised one step) | all pages | Bangla conjuncts at 10–11px were hard to read on phones. |
