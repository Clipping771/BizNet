-- CreateTable
CREATE TABLE "StoredFile" (
    "key" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("key")
);
