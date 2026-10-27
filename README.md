# BizNet — B2B Packaging & Disposables Platform

BizNet is a mobile-first B2B marketplace platform connecting verified restaurants, cafes, and food businesses with trusted packaging and disposable suppliers in Dhaka and globally.

---
## 🚀 Quick start (under 15 minutes)

**Option A — everything in Docker (demo):**

```bash
docker compose up --build -d
cp .env.example .env   # set DATABASE_URL=postgresql://postgres:admin@localhost:5432/biznet
pnpm install
pnpm db:seed
```

Open http://localhost:3000. Log in with a seeded phone (e.g. buyer `+8801722222202`, admin `+8801700000000`); with `SMS_PROVIDER=console` the OTP is printed in `docker compose logs app`. The `worker` service runs the scheduled jobs.

**Option B — app on the host (development):**

```bash
docker compose up -d postgres s3
cp .env.example .env          # fill DATABASE_URL, SESSION_SECRET (32+ chars), APP_URL, S3_* (endpoint http://127.0.0.1:9000)
pnpm install
pnpm prisma migrate deploy
pnpm tsx scripts/ensure-buckets.ts
pnpm db:seed
pnpm dev                      # http://localhost:3000
pnpm worker                   # in a second terminal
```

`pnpm test` (Vitest, separate `TEST_DATABASE_URL`), `pnpm build && pnpm test:e2e` (Playwright at 360×740).

## ⚙️ Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` / `TEST_DATABASE_URL` | PostgreSQL 16 (app / tests) |
| `SESSION_SECRET` | iron-session password, ≥ 32 characters (required in production) |
| `APP_URL` | Public base URL; also used for signed upload/download links and the CSRF origin check |
| `TRUST_PROXY` | `nginx`, `cloudflare` or `none` — which forwarded-IP header to trust (see below) |
| `STORAGE_DRIVER`, `S3_ENDPOINT`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | S3-compatible storage (R2 in production, moto locally); `memory` only for tests |
| `SMS_PROVIDER`, `SMS_HTTP_URL`, `SMS_API_KEY`, `SMS_SENDER_ID` | `console` (dev) or `http` gateway |
| `AI_PROVIDER`, `AI_API_KEY`, `STT_PROVIDER`, `STT_API_KEY` | AI and speech-to-text (mock by default) |
| `TRANSLATION_PROVIDER`, `TRANSLATION_API_KEY` | UI auto-draft / content translation (mock by default; content translation is off) |
| `DEV_TEST_PHONES`, `ADMIN_PHONES`, `ADMIN_EMAILS` | Test logins and admin bootstrap |
| `EVAL_REPORT_TOKEN` | Bearer token the nightly AI-eval workflow uses for `POST /api/admin/eval-report` |
| `SENTRY_DSN` | Optional error reporting |

## 🚢 Deploy

One Node process for the web app (`pnpm build && pnpm start`) plus one for the worker (`pnpm worker`), a managed PostgreSQL 16 and an S3 bucket pair. On each release: `pnpm prisma migrate deploy`. Health check: `GET /api/health` (database, storage, queue). The `Dockerfile` builds the same image for both processes (`docker compose` shows the wiring).

## 💾 Backups

Daily logical backup of the database (keep at least 14 days):

```bash
pg_dump --format=custom --no-owner "$DATABASE_URL" > "biznet-$(date +%F).dump"
# restore: pg_restore --clean --no-owner -d "$DATABASE_URL" biznet-YYYY-MM-DD.dump
```

Storage buckets are backed up with the provider's versioning / lifecycle rules (R2 or S3).

## 🛡️ Admin

`/admin` (users with role ADMIN): metrics dashboard with thresholds and CSV, verifications, reports and held questions, businesses (suspend / ban), requests and concierge, categories, market prices, languages (add / auto-draft / approve / activate), settings, ops time, export. Every admin change is written to the audit log.

---

## 🔒 Security Architecture & Reverse Proxy (`TRUST_PROXY`)

### Why `TRUST_PROXY` is Mandatory in Production
In **Next.js 15**, the `ip` property was completely removed from `NextRequest`. Without proxy configuration, fallback evaluation yields `127.0.0.1` for every incoming HTTP request. This causes critical vulnerabilities:
1. **Global Rate Limit Collisions**: All users worldwide hit the exact same IP rate limit bucket (`127.0.0.1`), resulting in global HTTP 429 lockouts after 10 requests.
2. **Rate Limit Evasion**: Attackers can spoof arbitrary IP headers (`x-forwarded-for: <random-ip>`) to bypass rate limits unless upstream proxies are explicitly configured and trusted.

### Configuration
Set `TRUST_PROXY` in your environment (e.g., `.env.production`):
```env
# For Nginx, AWS ALB, Traefik, or generic reverse proxies:
TRUST_PROXY="nginx"

# For Cloudflare:
TRUST_PROXY="cloudflare"
```

### IP Evaluation Rules ([lib/ip.ts](lib/ip.ts))
- **`TRUST_PROXY=nginx`**: Evaluates the **rightmost** hop from the `x-forwarded-for` header appended by the trusted reverse proxy (`forwarded.split(',').pop().trim()`). Leftmost client-injected IPs are strictly ignored, defeating header spoofing.
- **`TRUST_PROXY=cloudflare`**: Evaluates the trusted `cf-connecting-ip` header inserted at Cloudflare edge.
- **Production Guard**: If `process.env.NODE_ENV === "production"` and `TRUST_PROXY` is unset or empty, the application throws an immediate, fatal configuration error at startup to prevent running in an insecure state.

---

## 📱 Universal Multi-Method Authentication (§8.1)

1. **Bangladeshi Mobile Number Validation**:
   - Numbers starting with `+880` or `880` must strictly match the regex: `+8801[3-9]\d{8}` (14 characters total).
   - Malformed numbers like `+88017220001` (too short, only 9 digits after 880) and `+8801212345678` (invalid telecom operator 012) are strictly rejected.
   - International numbers in standard E.164 format (+1, +44, +971) are supported.
2. **Email + OTP Flow**:
   - Standard 6-digit verification code with 10-minute expiry and SHA-256 hash storage.
3. **Passkeys (FIDO2 / WebAuthn)**:
   - Biometric login (Touch ID, Face ID, Windows Hello, device PIN) with replay-safe single-use challenges.
4. **Dev Test Bypass (`000000`)**:
   - Strictly permitted ONLY when `process.env.NODE_ENV === "development"` and the number is listed in `DEV_TEST_PHONES`. Disallowed in `test` and `production`.

---

## 🏢 Business & Multi-Tenant Access Control

1. **Business Creation Verification Guard**:
   - Users must have either `phoneVerified === true` OR `emailVerified === true` in the database to create a business. Unverified users receive HTTP 403 Forbidden.
2. **Member Invitations (Email & Phone)**:
   - Businesses can invite members (`MANAGER` or `STAFF`) via phone number or email address.
   - Invitations are validated against the accepting user's verified phone or email.
3. **Sole Owner Protection**:
   - An account cannot be deleted while the user is the active `OWNER` of any business. Ownership must be transferred first.
4. **Server-Side Arabic Preview Guard**:
   - Arabic (`ar`) RTL preview is strictly restricted on the server to `ADMIN` users (or users matching `ADMIN_EMAILS`/`ADMIN_PHONES`). Non-admin users are automatically downgraded to English (`en`).

---

## 🛠️ Verification Commands

```bash
# Run unit & integration test suites
pnpm test

# Run strict ESLint CI checks (0 warnings allowed)
pnpm lint:ci

# Run TypeScript type check
npx tsc --noEmit

# Run Playwright E2E mobile tests (360x740)
pnpm test:e2e

# Run PostgreSQL foreign key index check
npx tsx scripts/check-fk-indexes.ts

# Verify zero migration diff
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "postgresql://postgres:admin@localhost:5432/biznet_shadow"
```

## ⏱️ Background worker (pg-boss)

Run next to the web app (same `DATABASE_URL`, no Redis):

```bash
pnpm worker
```

Schedules (Asia/Dhaka): `expire-requests` every 15 min, `auto-complete-orders` hourly, `compute-market-prices` nightly at 02:00. Run the price job once by hand with `pnpm prices:compute`; `pnpm db:seed` already runs it so `/prices` has data.
