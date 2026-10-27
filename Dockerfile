# BizNet — single Node image for the web app and the background worker (§3, §19).
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# pnpm version pinned in package.json "packageManager"
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]") \
  && pnpm install --frozen-lockfile

COPY . .
RUN pnpm prisma generate

# Build-time placeholders only; real values come from the environment at runtime
RUN SESSION_SECRET=build-only-placeholder-secret-0123456789abcdef \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    APP_URL=http://localhost:3000 \
    pnpm build

ENV NODE_ENV=production
EXPOSE 3000

# Apply migrations and make sure both buckets exist, then serve
CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm tsx scripts/ensure-buckets.ts && pnpm start --port 3000"]
