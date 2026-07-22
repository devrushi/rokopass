-- CreateEnum
CREATE TYPE "PlanAudience" AS ENUM ('PARENT', 'PROVIDER');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "audience" "PlanAudience" NOT NULL DEFAULT 'PARENT',
ADD COLUMN     "maxActiveActivities" INTEGER,
ALTER COLUMN "monthlyCredits" DROP NOT NULL,
ALTER COLUMN "stripePriceId" DROP NOT NULL;

