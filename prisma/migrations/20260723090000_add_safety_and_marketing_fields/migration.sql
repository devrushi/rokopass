-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "isSendFriendly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "allergyInfo" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dbsCertificateExpiresAt" TIMESTAMP(3),
ADD COLUMN     "dbsCertificateNumber" TEXT,
ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "tiktokUrl" TEXT;

