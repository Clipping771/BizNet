# Phase 5 report — Admin, metrics, hardening

Branch: `phase-5` (from `phase-4`). Built directly.

## 1. Features built

| Area | What | Where |
|---|---|---|
| F20 metrics (§13) | Date-range dashboard: every funnel step separately (AI-assisted / manual / concierge, invites, quote in 24 h split SUPPLIER vs CONCIERGE, ≥ 2 quotes, median time to first quote, request → order, confirmed → completed, feedback %, second request in 30 days, active at 60/90 days, re-order mode split, contact blocked/revealed), AI (assistant accepted/edited/discarded/fallback, p50/p95 latency, cost per request, most-edited fields, comparison usage, orders matching suggestion, 👍 rate, post-validation removals, AI cost per completed order, latest eval), ops (minutes per verification, by activity, per 100 completed orders, concierge share), supply/demand health; green/red thresholds from Settings; CSV export | `lib/repo/metrics.ts`, `app/api/admin/metrics/**`, `app/(app)/admin/page.tsx` |
| F19 admin | Reports + held questions (resolve / approve / reject, audited); businesses (suspend / reinstate with ops minutes, ban / unban members); requests overview + concierge; categories editor with schema validation; market-price review (all groups, exclusions, recompute); languages; typed settings; CSV export (requests, quotes, orders, feedback, businesses, ops time); AI eval report endpoint + view | `lib/repo/admin.ts`, `app/api/admin/**`, `app/(app)/admin/**` |
| F21 languages (§11) | Add language (DRAFT), auto-draft via TranslationProvider (mock), review/edit with placeholder check, approve critical, ACTIVE only with ≥ 90% critical keys, import/export JSON, catalog version bump; served languages now come from the Language table (ACTIVE public, DRAFT/BETA admin preview) | `lib/repo/languages.ts`, `lib/i18n-critical.ts`, `app/layout.tsx` |
| Hardening (§10, §14) | Per-route mutation rate limits; Origin-based CSRF check; idempotent quote submit and order confirm; text sanitisation; audit entries for contact reveal and feedback; `/api/health` (DB, S3, queue); 404 / error / global-error pages; account menu for logged-in users without a business | `lib/http/guard.ts`, `middleware.ts`, `app/api/health`, `app/not-found.tsx`, `app/error.tsx` |
| Ops | Dockerfile; docker compose (postgres, moto S3, app, worker); README quick start, env vars, deploy, daily `pg_dump` backup | `Dockerfile`, `docker-compose.yml`, `README.md` |

## 2. Tests

- `pnpm test`: **30 files, 344 tests passed** (adds `phase5-metrics`, `phase5-admin`, `phase5-hardening`).
- `pnpm test:e2e`: **14 / 14 passed** at 360×740 (adds `phase5-admin`).
- `tsc --noEmit`, `pnpm lint:ci` clean; `pnpm build` succeeds; largest first-load JS 169 kB (`/requests/[code]`), under 200 kB.
- New CI job `compose-demo`: `docker compose up --build` → `/api/health` → `pnpm db:seed` → search, prices, login respond → worker starts.

| Acceptance criterion (§16) | Evidence |
|---|---|
| Dashboard numbers equal a hand-calculated fixture | `phase5-metrics` (March 2031 fixture, every number asserted) |
| Each funnel step shown separately | dashboard sections; `phase5-metrics`; e2e `phase5-admin` |
| SUPPLIER vs CONCIERGE split correct | `requestsWithSupplierQuote24h` / `requestsWithConciergeQuote24h` in `phase5-metrics` |
| Ops minutes per 100 completed orders computed | `opsMinutesPer100CompletedOrders = 3600` in `phase5-metrics` |
| In a test DB, ar via admin + mock auto-draft + approving critical keys allows ACTIVE | `phase5-admin` (refused before approval, ACTIVE after; restored to DRAFT) |
| Seed and production keep ar DRAFT | `phase5-admin` "seed keeps ar DRAFT"; seed + extract script set DRAFT |
| Lighthouse targets | Mobile preset, simulated slow 4G, production build, seeded data, logged-in pages via cookie: `/` 97 / 100, `/home` 96 / 95, `/requests/new` 96 / 95, `/requests/[code]` 94 / 95 (performance / accessibility). One run per page (not the median of 3). |
| `docker compose up && pnpm db:seed` gives a working demo | CI job `compose-demo` (Docker is not installed on the dev machine, so this is proven in CI only) |

Screenshots (360×740): `reports/screenshots/27…31-*.png`.

## 3. Known issues

- Real AI / STT / translation provider adapters are still mock-only; the nightly eval workflow therefore reports mock results until keys and adapters are added.
- Local S3 (moto) keeps uploads in memory; restart loses them (production uses R2/S3).
- Dispute queue: disputes appear in Reports and are resolved on the order page by an admin; there is no dedicated side-by-side dispute view yet.

## 4. Request for approval

All Phase 5 acceptance criteria pass locally (compose demo in CI); please review and reply "approved".
