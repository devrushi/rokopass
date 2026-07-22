-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('ACTIVITY_PHOTO', 'STAFF_PHOTO');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "whatsappNumber" TEXT;

-- CreateTable
CREATE TABLE "ActivityMedia" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityMedia_activityId_idx" ON "ActivityMedia"("activityId");

-- AddForeignKey
ALTER TABLE "ActivityMedia" ADD CONSTRAINT "ActivityMedia_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

