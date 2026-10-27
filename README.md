# BizNet — B2B Packaging & Disposables Platform

BizNet is a mobile-first B2B marketplace platform connecting verified restaurants, cafes, and food businesses with trusted packaging and disposable suppliers in Dhaka and globally.

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
