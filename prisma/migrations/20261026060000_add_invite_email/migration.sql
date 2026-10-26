-- AlterTable
ALTER TABLE "MemberInvite" ADD COLUMN "email" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "MemberInvite_email_idx" ON "MemberInvite"("email");
