# Phase 6 report — READY features (built, switched off)

Branch: `phase-6` (from `phase-5`). Scope chosen by the founder: build the READY features completely and keep them **off** until an admin switches them on in `/admin/settings`. LATER AI features (F24) are not built.

## 1. What was built

| F | Feature | Switch | Where |
|---|---|---|---|
| F23 | Lead credits: ledger balance, one-time free trial for verified suppliers, first quote per request costs 1 credit (advisory lock, never negative), 402 + "Get credits" link when empty; supplier credits page (balance, packs, history, payments); manual bKash/Nagad payment submission (TrxID unique, sender number, pack); admin payment queue — approve adds credits exactly once, reject adds nothing; all audited | `leadCreditsEnabled` (off), `creditPacks`, `freeTrialCredits`, `paymentReceivers` | `lib/repo/credits.ts`, `app/api/credits/**`, `app/api/admin/payments/**`, `app/(app)/business/credits`, `app/(app)/admin/payments` |
| F22 | Content translation: "Translate" on messages, quote notes, questions and answers when the text's language differs from the UI; "Translated · Show original"; server-side read checks; numbers/units/money masked and restored exactly; ContentTranslation cache; hard daily budget + per-user limit; mock + DeepL adapter; order confirmation still shows original terms | `translationEnabled` (off), `translationDailyBudgetUsd` | `lib/repo/content-translation.ts`, `lib/translation/*`, `components/ui/TranslatableText.tsx`, `app/api/translate` |
| F21/F25 | Extra languages: the picker now comes from the database and persists the choice (cookie + user); combined with the Phase 5 admin flow (add → auto-draft → approve → ACTIVE) a 3rd language can go live without code changes | language status | `app/api/languages`, `app/api/account/language`, `app/(app)/account/language` |
| — | Public feature-switch endpoint for the UI | — | `app/api/settings/public` |

## 2. Tests

- `pnpm test`: **32 files, 357 tests passed** (adds `integration/phase6`, `unit/translation-protect`).
- `pnpm test:e2e`: **17 / 17 passed** at 360×740 (adds `phase6-ready`, which switches the features on for the test and off again).
- `tsc --noEmit`, `pnpm lint:ci` clean; `pnpm build` succeeds.

| Check | Test |
|---|---|
| Nothing is charged while credits are off | `phase6` |
| Trial once; first quote per request −1; revisions free; 0 credits → 402 and no quote row | `phase6` |
| Concurrent first quotes with 1 credit → exactly one succeeds, balance 0 | `phase6` |
| Payment validation, duplicate TrxID 409, STAFF 403, non-admin review 403; double approval → credits once | `phase6` |
| Translation off → 403; on → numbers kept, cached; non-party 404; bad field/language 400; same language untouched | `phase6`, `translation-protect` |
| Picker lists ACTIVE (admins also drafts), sets cookie, refuses unavailable languages | `phase6`, e2e |

Screenshots (360×740): `reports/screenshots/32…35-*.png`.

## 3. Turning features on (admin)

1. `/admin/settings`: set `paymentReceivers` (bKash/Nagad merchant numbers), adjust `creditPacks` / `freeTrialCredits`, then `leadCreditsEnabled = true`.
2. For translation: set `TRANSLATION_PROVIDER=deepl` and `TRANSLATION_API_KEY` in the environment, check `translationDailyBudgetUsd`, then `translationEnabled = true`.
3. For a new UI language: `/admin/languages` → add → auto-draft → review/approve (≥ 90% critical) → ACTIVE.

## 4. Known issues

- DeepL may not support every pair involving Bangla; unsupported pairs fall back to the original text (no wrong output).
- No real payment gateway — payments are verified manually by an admin, as the spec requires for the MVP.
- LATER AI features (semantic search, AI listing writer, quote assistant, discussion answers, trust signals, market insight) are not built.
