-- CreateTable
CREATE TABLE "AppBuild" (
    "id" UUID NOT NULL,
    "appProjectId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "designVersion" INTEGER,
    "easBuildId" TEXT,
    "appVersion" TEXT,
    "buildNumber" TEXT,
    "artifactUrl" TEXT,
    "error" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AppBuild_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppBuild_easBuildId_key" ON "AppBuild"("easBuildId");

-- CreateIndex
CREATE INDEX "AppBuild_appProjectId_createdAt_idx" ON "AppBuild"("appProjectId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppBuild" ADD CONSTRAINT "AppBuild_appProjectId_fkey" FOREIGN KEY ("appProjectId") REFERENCES "AppProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
