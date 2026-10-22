-- AlterTable
ALTER TABLE "AppProject" ADD COLUMN     "androidPackage" TEXT,
ADD COLUMN     "credentialsRef" TEXT,
ADD COLUMN     "iosBundleId" TEXT,
ADD COLUMN     "storeAccounts" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "AppProject_iosBundleId_key" ON "AppProject"("iosBundleId");

-- CreateIndex
CREATE UNIQUE INDEX "AppProject_androidPackage_key" ON "AppProject"("androidPackage");
