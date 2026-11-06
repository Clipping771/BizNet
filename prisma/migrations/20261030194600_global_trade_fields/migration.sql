-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "buyerConfirmedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "parityLocked" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "supplierConfirmedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'PENDING_CONFIRMATION';

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "baseRateToUsd" DECIMAL(20,10),
ADD COLUMN IF NOT EXISTS "crossRateSnapshot" DECIMAL(20,10),
ADD COLUMN IF NOT EXISTS "displayedCurrency" TEXT,
ADD COLUMN IF NOT EXISTS "displayedRateToUsd" DECIMAL(20,10),
ADD COLUMN IF NOT EXISTS "displayedTotalAmount" DECIMAL(14,2),
ADD COLUMN IF NOT EXISTS "exchangeRateTimestamp" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Currency" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "rateToUsd" DECIMAL(20,10) NOT NULL,
    "isOfficial" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RestrictedJurisdiction" (
    "countryCode" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestrictedJurisdiction_pkey" PRIMARY KEY ("countryCode")
);
