# Phase 3 report — Core loop

Branch: `phase-3`. Built by Antigravity, then independently reviewed and fixed (see §3).

## 1. Features built

| F | Feature | Where |
|---|---|---|
| F6 | AI Request Assistant (text + voice, editable prefill, uncertain fields as tap chips, AI chips, fallback to empty wizard, 24 h cache, per-user/global budget, redaction, prohibited items) | `lib/ai/requestAssistant.ts`, `lib/ai/voiceTranscription.ts`, `app/api/ai/*`, `app/(app)/requests/new` |
| F7 | Request wizard (3 steps, needed-by chips + date, photos ≤ 5, budget note, quote window), lifecycle, cancel with reason, expire job | `lib/repo/request.ts`, `jobs/expire-requests.ts` |
| F8 | Deterministic matching with stored score + reasons, direct-supplier re-orders, zero-match concierge flag, supplier inbox | `lib/matching/score.ts`, `jobs/match-request.ts`, `app/(app)/requests/inbox` |
| F9 | Quotes against the spec (spec match + offered value, payment-term highlight, ≤ 3 private attachments), revisions, withdraw, re-submit on the same row | `lib/repo/quote.ts`, supplier panel in `app/(app)/requests/[code]` |
| F10 | Deterministic comparison table + priority score; AI comparison in codes only with post-validation and server best fit | `lib/compare/priority.ts`, `lib/ai/compare/*`, `app/api/quotes/compare` |
| F11 | Accept → order in one transaction, confirmation sheet with original terms, order state machine | `lib/repo/quote.ts`, `lib/orders/transitions.ts`, `app/(app)/orders/[code]` |
| F12 | Private two-tap reliability feedback | `lib/repo/order.ts` |
| F13 | Re-order (previous supplier only / everyone); "Create a new request from this" after cancellation | order page, `/requests/new?repeatOf=` |
| F14/F15 | Messaging per request with 10 s polling, contact filter (soft block), contact reveal rules, report message | `lib/repo/messaging.ts`, `lib/contact/detect.ts` |
| F19 (part) | Concierge: admin creates a request for a buyer / a quote for a supplier (flagged, ops minutes) | `app/(app)/admin/concierge`, `app/api/admin/concierge/*` |

## 2. Tests (local, PostgreSQL 16)

- `pnpm test`: **23 files, 295 tests passed** (unit, integration, AI evals with the mock provider).
- `pnpm test:e2e`: **8 / 8 passed** at 360×740, including the full Phase 3 acceptance flow driven through the UI and the AI-failure path.
- `tsc --noEmit` clean, `pnpm lint:ci` clean, `pnpm build` succeeds.
- CI run: see the PR / Actions page for the `phase-3` branch.

Acceptance criteria covered by automated tests:

| Criterion (§16) | Test |
|---|---|
| Bangla need → wizard prefilled (containers, 750, lid, 500, tomorrow, Mirpur), material asked as uncertain | e2e `phase3-flow` |
| 3 suppliers invited with reasons; 2 quote (one late, one spec-different) from their own sessions | e2e |
| Comparison shows late warning + spec difference; best fit for SPEED is never the late quote; AI panel never suggests it, has no order button | e2e, `ai-evals/quote-comparison` |
| Post-validation removes a fake number / false codes; digit summary rejected | `ai-evals/quote-comparison` |
| Order confirmed → other quote REJECTED → CONFIRMED→DISPATCHED→DELIVERED→COMPLETED → feedback saved | e2e |
| "Only from previous supplier" re-order invites exactly 1 supplier | e2e |
| AI failure opens the empty wizard | e2e (budget exhausted) |
| Concurrent double accept creates exactly one order (same quote and two different quotes) | `phase3-core-loop`, `phase3-fixes` |
| Every illegal order transition rejected | `unit/order-transitions` |
| Cancel leaves other quotes REJECTED; withdraw → re-submit reuses the row with version + 1 | `phase3-core-loop`, `phase3-fixes` |
| Contact-filter fixtures (≥ 30 bypass, ≥ 30 legitimate) | `unit/contact-detect` |
| AI budget concurrency | `ai-budget` |
| Voice > 60 s or > 2 MB rejected with fallback | `voice-limits` |
| IDOR: requests, quotes, orders, conversations, files | `phase3-core-loop`, `phase3-fixes` |

Screenshots (360×740): `reports/screenshots/10…19-*.png` (bn) and `18-order-detail-en.png` (en).

## 3. Independent review — problems found and fixed

Security
- Quote and message attachments were written to the **public** bucket → moved to `private/…`; signed URLs only for the deal's two businesses (and admins).
- Attachment / photo keys were never checked → any key (even another business's verification document) could be attached. Now validated per business and purpose.
- Any BASIC supplier could quote on **any** request by id, and direct re-order requests accepted everyone → quoting requires an invite or serving the category; direct requests accept only the previous supplier.
- Any supplier could open a conversation on any request and message the buyer → only invited/quoting suppliers.
- "Show contact" worked without a received quote → now requires one.
- `directSupplierId` / `repeatOfRequestId` were taken from the client unchecked → validated against the buyer's completed order.
- Another user's AI interaction could be linked to a request (and its outcome overwritten) → ownership checked.
- `POST /api/ai/rate` had no authentication → owner only.

Correctness
- The request page called `/api/requests/[code]`, which **did not exist** → added with resource-level read rules (buyer sees all quotes, supplier only its own, others 404).
- The request page had no buyer/supplier separation, no way to open messaging, a quote form without spec match / payment term / validity / notes / attachments, raw enum labels and hard-coded fallbacks → rewritten.
- The order page read non-existent fields and sent the wrong re-order payload → rewritten (actions per side, dispute/cancel reasons, admin resolution, feedback sheet, re-order, "new request from this").
- Bottom navigation covered the confirmation sheets (same z-index) → "Confirm order" could not be tapped on a phone.
- "Compare with AI" always failed (mock returned the request-assistant shape) → deterministic comparison mock.
- Re-submitting a withdrawn quote became REVISED instead of SUBMITTED; withdrawal was allowed after the request closed; accepting marked WITHDRAWN quotes as REJECTED; expired quotes could be accepted; rejected suppliers were not notified.
- Accept and order transitions were not atomic (read-then-write) → conditional `updateMany`.
- Late check used time of day → Dhaka calendar days.
- Server accepted negative prices, fractional days, unknown payment terms, unknown spec fields, missing required attributes, arbitrary quote windows.
- AI outcome was always ACCEPTED_AS_IS (edited fields / discard never sent); cache hits reused another user's interaction.
- Voice: the 60 s auto-stop never fired (stale state) and the duration was never sent, so the server could not enforce 60 s.
- Wizard: wrong category label keys, untranslated chips, no date picker, no photos, no budget note; concierge used payment terms that do not exist in the schema.

## 4. Known issues / not in this phase

- Real AI provider adapters (anthropic / openai / google) are not implemented — `getAiProvider()` returns the mock. The nightly real-provider eval workflow therefore cannot run yet.
- `QUOTE_COMPARISON` outcome DISCARDED (no order) is not written yet (Phase 5 metrics).
- `docker-compose.yml` still references `minio/minio:latest`, which no longer pulls from Docker Hub; CI uses moto.

## 5. Request for approval

All Phase 3 acceptance criteria pass locally; please review and reply "approved" to start Phase 4.
