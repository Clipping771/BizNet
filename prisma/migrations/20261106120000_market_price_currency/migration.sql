-- Market price groups keep the currency of the quotes they summarise
ALTER TABLE "MarketPriceSnapshot" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
