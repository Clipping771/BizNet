-- AlterTable
ALTER TABLE "Answer" ALTER COLUMN "lang" SET DEFAULT 'en';

-- AlterTable
ALTER TABLE "Business" ALTER COLUMN "lang" SET DEFAULT 'en';

-- AlterTable
ALTER TABLE "Listing" ALTER COLUMN "lang" SET DEFAULT 'en',
ALTER COLUMN "priceMin" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "priceMax" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "currency" SET DEFAULT 'USD';

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "lang" SET DEFAULT 'en';

-- AlterTable
ALTER TABLE "Question" ALTER COLUMN "lang" SET DEFAULT 'en';

-- AlterTable
ALTER TABLE "Quote" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "deliveryCharge" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "totalPrice" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "currency" SET DEFAULT 'USD',
ALTER COLUMN "lang" SET DEFAULT 'en',
ALTER COLUMN "displayedTotalAmount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "Request" ALTER COLUMN "lang" SET DEFAULT 'en';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_business_search_vector" ON "Business" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_business_name_trgm" ON "Business" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_listing_search_vector" ON "Listing" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_listing_title_trgm" ON "Listing" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_question_search_vector" ON "Question" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_question_title_trgm" ON "Question" USING GIN ("title" gin_trgm_ops);
