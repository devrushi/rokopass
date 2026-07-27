-- Migration: 20260722012416_init
-- CreateTable
CREATE TABLE "HealthCheck" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthCheck_pkey" PRIMARY KEY ("id")
);

-- Migration: 20260722015709_add_user_auth
/*
  Warnings:

  - You are about to drop the `HealthCheck` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PARENT', 'ADMIN');

-- DropTable
DROP TABLE "HealthCheck";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PARENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Migration: 20260722021257_add_activities_and_schedules
-- CreateEnum
CREATE TYPE "ProviderVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PROVIDER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "verificationStatus" "ProviderVerificationStatus";

-- CreateTable
CREATE TABLE "AgeGroup" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minAge" INTEGER NOT NULL,
    "maxAge" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "ageGroupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "creditCost" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringSchedule" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL DEFAULT 'WEEKLY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "recurringScheduleId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgeGroup_label_key" ON "AgeGroup"("label");

-- CreateIndex
CREATE INDEX "Activity_providerId_idx" ON "Activity"("providerId");

-- CreateIndex
CREATE INDEX "Activity_ageGroupId_idx" ON "Activity"("ageGroupId");

-- CreateIndex
CREATE INDEX "RecurringSchedule_activityId_idx" ON "RecurringSchedule"("activityId");

-- CreateIndex
CREATE INDEX "ClassSession_activityId_startsAt_idx" ON "ClassSession"("activityId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSession_recurringScheduleId_startsAt_key" ON "ClassSession"("recurringScheduleId", "startsAt");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_ageGroupId_fkey" FOREIGN KEY ("ageGroupId") REFERENCES "AgeGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_recurringScheduleId_fkey" FOREIGN KEY ("recurringScheduleId") REFERENCES "RecurringSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migration: 20260722123631_add_billing_and_credits
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');

-- CreateEnum
CREATE TYPE "CreditTransactionReason" AS ENUM ('SUBSCRIPTION_INITIAL', 'SUBSCRIPTION_RENEWAL', 'BOOKING', 'BOOKING_REFUND', 'ADMIN_ADJUSTMENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "stripeCustomerId" TEXT;

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "monthlyCredits" INTEGER NOT NULL,
    "priceGbp" INTEGER NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "amount" INTEGER NOT NULL,
    "reason" "CreditTransactionReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_stripePriceId_key" ON "Plan"("stripePriceId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_idx" ON "CreditTransaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Migration: 20260722125131_add_children_and_bookings
-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'ATTENDED', 'NO_SHOW');

-- AlterTable
ALTER TABLE "CreditTransaction" ADD COLUMN     "bookingId" TEXT;

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "creditsSpent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Child_parentId_idx" ON "Child"("parentId");

-- CreateIndex
CREATE INDEX "Booking_sessionId_idx" ON "Booking"("sessionId");

-- CreateIndex
CREATE INDEX "Booking_parentId_idx" ON "Booking"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_childId_sessionId_key" ON "Booking"("childId", "sessionId");

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Migration: 20260722134106_add_admin_moderation
-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('PROVIDER_APPROVED', 'PROVIDER_REJECTED', 'ACTIVITY_FLAGGED', 'ACTIVITY_UNFLAGGED', 'ACTIVITY_FEATURED', 'ACTIVITY_UNFEATURED');

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isFlagged" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_adminId_idx" ON "AuditLog"("adminId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Migration: 20260722140251_add_booking_status_enum_values
-- Added in its own migration/transaction: Postgres requires new enum values to be committed
-- before they can be used (e.g. as a column default) — see the follow-up migration.
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "BookingStatus" ADD VALUE 'REJECTED';

-- Migration: 20260722140252_set_booking_status_default_pending
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'PENDING_APPROVAL';

-- Migration: 20260722144046_add_media_and_whatsapp
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


-- Migration: 20260722150000_add_plan_audience
-- CreateEnum
CREATE TYPE "PlanAudience" AS ENUM ('PARENT', 'PROVIDER');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "audience" "PlanAudience" NOT NULL DEFAULT 'PARENT',
ADD COLUMN     "maxActiveActivities" INTEGER,
ALTER COLUMN "monthlyCredits" DROP NOT NULL,
ALTER COLUMN "stripePriceId" DROP NOT NULL;


-- Migration: 20260723090000_add_safety_and_marketing_fields
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


-- Migration: 20260723100000_add_charity_ledger_reasons
-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'CHARITY_GRANT_ISSUED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CreditTransactionReason" ADD VALUE 'CHARITY_DONATION';
ALTER TYPE "CreditTransactionReason" ADD VALUE 'CHARITY_GRANT';


-- Migration: 20260723110000_add_leaderboard_opt_in
-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "isOnLeaderboard" BOOLEAN NOT NULL DEFAULT false;


-- Migration: 20260723120000_add_school_role
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


-- Migration: 20260724090000_add_child_photo
-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "photoUrl" TEXT;


-- Migration: 20260724130000_provider_accounting
-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('COST_OF_GOODS', 'CAR_VAN_TRAVEL', 'STAFF_WAGES', 'RENT_RATES_UTILITIES', 'REPAIRS_MAINTENANCE', 'ADVERTISING_MARKETING', 'LEGAL_PROFESSIONAL', 'OFFICE_ADMIN', 'OTHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "connectDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "connectPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeConnectAccountId" TEXT;

-- CreateTable
CREATE TABLE "ProviderBusinessProfile" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "legalBusinessName" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'GB',
    "utr" TEXT,
    "isVatRegistered" BOOLEAN NOT NULL DEFAULT false,
    "vatNumber" TEXT,
    "vatRatePercent" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderBusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "creditValueGbp" INTEGER NOT NULL DEFAULT 250,
    "commissionRatePercent" INTEGER NOT NULL DEFAULT 15,
    "platformLegalName" TEXT NOT NULL DEFAULT 'Roshelia Ltd',
    "platformAddress" TEXT NOT NULL DEFAULT 'Leicester, United Kingdom',
    "platformVatRegistered" BOOLEAN NOT NULL DEFAULT false,
    "platformVatNumber" TEXT,
    "platformVatRatePercent" INTEGER NOT NULL DEFAULT 20,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutStatement" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "statementNumber" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "creditsRedeemed" INTEGER NOT NULL,
    "creditValueGbpSnapshot" INTEGER NOT NULL,
    "grossAmountGbp" INTEGER NOT NULL,
    "commissionRatePercentSnapshot" INTEGER NOT NULL,
    "commissionAmountGbp" INTEGER NOT NULL,
    "commissionVatGbp" INTEGER NOT NULL DEFAULT 0,
    "netAmountGbp" INTEGER NOT NULL,
    "providerLegalName" TEXT NOT NULL,
    "providerAddress" TEXT NOT NULL,
    "providerVatNumber" TEXT,
    "platformLegalName" TEXT NOT NULL,
    "platformAddress" TEXT NOT NULL,
    "platformVatNumber" TEXT,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "stripeTransferId" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutStatementLine" (
    "id" TEXT NOT NULL,
    "payoutStatementId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "activityTitle" TEXT NOT NULL,
    "sessionStartsAt" TIMESTAMP(3) NOT NULL,
    "childInitials" TEXT NOT NULL,
    "creditsSpent" INTEGER NOT NULL,
    "amountGbp" INTEGER NOT NULL,

    CONSTRAINT "PayoutStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderExpense" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amountGbp" INTEGER NOT NULL,
    "incurredOn" TIMESTAMP(3) NOT NULL,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderBusinessProfile_providerId_key" ON "ProviderBusinessProfile"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutStatement_statementNumber_key" ON "PayoutStatement"("statementNumber");

-- CreateIndex
CREATE INDEX "PayoutStatement_providerId_idx" ON "PayoutStatement"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutStatementLine_bookingId_key" ON "PayoutStatementLine"("bookingId");

-- CreateIndex
CREATE INDEX "PayoutStatementLine_payoutStatementId_idx" ON "PayoutStatementLine"("payoutStatementId");

-- CreateIndex
CREATE INDEX "ProviderExpense_providerId_idx" ON "ProviderExpense"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeConnectAccountId_key" ON "User"("stripeConnectAccountId");

-- AddForeignKey
ALTER TABLE "ProviderBusinessProfile" ADD CONSTRAINT "ProviderBusinessProfile_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutStatement" ADD CONSTRAINT "PayoutStatement_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutStatementLine" ADD CONSTRAINT "PayoutStatementLine_payoutStatementId_fkey" FOREIGN KEY ("payoutStatementId") REFERENCES "PayoutStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutStatementLine" ADD CONSTRAINT "PayoutStatementLine_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderExpense" ADD CONSTRAINT "ProviderExpense_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


