-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "plan" TEXT,
ADD COLUMN "planCheckedAt" TIMESTAMP(3),
ADD COLUMN "planTrialEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AppProject" ADD COLUMN "iosHeldVersion" INTEGER;
