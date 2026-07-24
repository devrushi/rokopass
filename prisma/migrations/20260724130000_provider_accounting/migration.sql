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

