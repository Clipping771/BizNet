# Phase 4 report — Search, discussion, market prices

Branch: `phase-4` (from `main` after the Phase 2 + 3 merge). Built directly (not by Antigravity).

## 1. Features built

| F | Feature | Where |
|---|---|---|
| F16 | Search: Products / Businesses tabs; filters category, area, verified only (default on), filterable attributes, price range, MOQ; ranking ts_rank + trigram + verified boost + has-listing boost; Bangla↔English synonyms and digits; "Request a quote" (prefills category, optional "only this supplier"); empty state → post a request; `search` event | `lib/search/query.ts`, `lib/repo/search.ts`, `app/api/search`, `app/(app)/search` |
| F17 (LITE) | Discussion: ask (title 10–150, body, optional category, anonymous), answer, up/down vote (no self-votes, toggle), best answer by the asker → SOLVED, report; selling filter (Settings terms + phone/link detection) → soft block, then PENDING_REVIEW hidden until an admin approves (audited); similar questions while typing (trigram + full-text, top 3); dismissible "Need to buy something for this?" card when the category has listings; logged-out read-only | `lib/repo/discussion.ts`, `lib/discussion/*`, `app/api/questions/**`, `app/api/votes`, `app/api/admin/questions/**`, `app/(app)/q/**` |
| F18 (LITE) | Nightly market prices from the last 30 days of supplier quotes: spec known (all specified comparable fields MATCH), complete, grouped by category + spec subset + unit + quantity band + delivery included + area; > 40% supplier collapsed to its median; IQR outliers excluded and counted; publishable with ≥ 8 quotes from ≥ 3 suppliers (Settings); `/prices` shows p25–p75, median, spec, unit, band, delivery, area, period and "based on N quotes from M suppliers" — never "the market price"; admin recompute + manual exclusion (audited) | `lib/pricing/compute.ts`, `jobs/compute-market-prices.ts`, `lib/repo/pricing.ts`, `app/api/prices`, `app/api/admin/market-prices/**`, `app/(app)/prices` |
| — | Background worker (pg-boss): expire-requests (15 min), auto-complete-orders (hourly), compute-market-prices (02:00 Dhaka) | `jobs/worker.ts`, `pnpm worker` |

## 2. Tests

- `pnpm test`: **27 files, 324 tests passed** (adds `unit/pricing-compute`, `unit/search-and-selling`, `integration/phase4`).
- `pnpm test:e2e`: **11 / 11 passed** at 360×740 (adds `phase4-flow`: search, prices, discussion).
- `tsc --noEmit` and `pnpm lint:ci` clean; `pnpm build` succeeds.

| Acceptance criterion (§16) | Test |
|---|---|
| "বক্স", "box", "কাপ ২৫০" return the expected seeded results | `integration/phase4` (search), e2e `phase4-flow` |
| Selling-style question goes to PENDING_REVIEW (after the soft block) and stays hidden until approved | `integration/phase4`, e2e |
| Seed produces exactly one publishable and one non-publishable price group | `integration/phase4` (seed batch), e2e `/prices` |
| An injected extreme quote is excluded and counted | `integration/phase4`, `unit/pricing-compute` |
| A supplier with > 40% share does not dominate the median | `integration/phase4`, `unit/pricing-compute` |

Screenshots (360×740): `reports/screenshots/20…26-*.png` (bn) and `23-prices-en.png` (en).

## 3. Also fixed while building

- Bans were never enforced: `isBanned` was not passed into the authorization context.
- Phase 3 jobs (expire requests, auto-complete orders) had no scheduler → worker added.
- Discussion lookups with a missing id would have matched an arbitrary row (`findFirst({ id: undefined })`) → every id lookup is guarded.

## 4. Known issues / not in this phase

- Admin UI for held questions and market-price review is API-only for now (`/api/admin/questions/*`, `/api/admin/market-prices/*`); the admin pages are Phase 5.
- Answer text is not translated and there is no "Translated · Show original" (translation is READY/off).
- Real AI provider adapters are still mock-only (from Phase 3).

## 5. Request for approval

All Phase 4 acceptance criteria pass locally; please review and reply "approved" to start Phase 5.
