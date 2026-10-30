-- AlterTable
ALTER TABLE "AppProject" ADD COLUMN     "push" JSONB;

-- CreateTable
CREATE TABLE "PushDevice" (
    "id" UUID NOT NULL,
    "appProjectId" UUID NOT NULL,
    "installId" UUID NOT NULL,
    "testCode" VARCHAR(8) NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "country" VARCHAR(2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushCampaign" (
    "id" UUID NOT NULL,
    "appProjectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image" JSONB,
    "imageUrl" TEXT,
    "link" JSONB,
    "countries" TEXT[],
    "status" TEXT NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "cursor" UUID,
    "targeted" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushDevice_appProjectId_testCode_idx" ON "PushDevice"("appProjectId", "testCode");

-- CreateIndex
CREATE INDEX "PushDevice_lastSeenAt_idx" ON "PushDevice"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_appProjectId_installId_key" ON "PushDevice"("appProjectId", "installId");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_appProjectId_token_key" ON "PushDevice"("appProjectId", "token");

-- CreateIndex
CREATE INDEX "PushCampaign_appProjectId_createdAt_idx" ON "PushCampaign"("appProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "PushCampaign_status_sendAt_idx" ON "PushCampaign"("status", "sendAt");

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_appProjectId_fkey" FOREIGN KEY ("appProjectId") REFERENCES "AppProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushCampaign" ADD CONSTRAINT "PushCampaign_appProjectId_fkey" FOREIGN KEY ("appProjectId") REFERENCES "AppProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

