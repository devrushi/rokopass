-- CreateEnum
CREATE TYPE "SchoolApprovalStatus" AS ENUM ('SHORTLISTED', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SCHOOL';

-- CreateTable
CREATE TABLE "SchoolProviderApproval" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "SchoolApprovalStatus" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolProviderApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolProviderApproval_providerId_idx" ON "SchoolProviderApproval"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolProviderApproval_schoolId_providerId_key" ON "SchoolProviderApproval"("schoolId", "providerId");

-- AddForeignKey
ALTER TABLE "SchoolProviderApproval" ADD CONSTRAINT "SchoolProviderApproval_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolProviderApproval" ADD CONSTRAINT "SchoolProviderApproval_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

