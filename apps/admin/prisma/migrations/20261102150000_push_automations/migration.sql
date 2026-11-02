-- AlterTable
ALTER TABLE "PushDevice" ADD COLUMN     "bagChangedAt" TIMESTAMP(3),
ADD COLUMN     "cartId" TEXT,
ADD COLUMN     "utcOffset" INTEGER;

-- CreateTable
CREATE TABLE "PushWishlistItem" (
    "deviceId" UUID NOT NULL,
    "productId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3),

    CONSTRAINT "PushWishlistItem_pkey" PRIMARY KEY ("deviceId","productId")
);

-- CreateTable
CREATE TABLE "PushAutomation" (
    "id" UUID NOT NULL,
    "appProjectId" UUID NOT NULL,
    "template" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "delay" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageMode" TEXT NOT NULL DEFAULT 'product',
    "image" JSONB,
    "imageUrl" TEXT,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "problem" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushAutomationSend" (
    "automationId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushAutomationSend_pkey" PRIMARY KEY ("automationId","deviceId","event")
);

-- CreateIndex
CREATE INDEX "PushWishlistItem_savedAt_idx" ON "PushWishlistItem"("savedAt");

-- CreateIndex
CREATE INDEX "PushAutomation_enabled_idx" ON "PushAutomation"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "PushAutomation_appProjectId_template_key" ON "PushAutomation"("appProjectId", "template");

-- CreateIndex
CREATE INDEX "PushAutomationSend_deviceId_createdAt_idx" ON "PushAutomationSend"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "PushAutomationSend_createdAt_idx" ON "PushAutomationSend"("createdAt");

-- CreateIndex
CREATE INDEX "PushDevice_appProjectId_bagChangedAt_idx" ON "PushDevice"("appProjectId", "bagChangedAt");

-- AddForeignKey
ALTER TABLE "PushWishlistItem" ADD CONSTRAINT "PushWishlistItem_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PushDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushAutomation" ADD CONSTRAINT "PushAutomation_appProjectId_fkey" FOREIGN KEY ("appProjectId") REFERENCES "AppProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushAutomationSend" ADD CONSTRAINT "PushAutomationSend_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "PushAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushAutomationSend" ADD CONSTRAINT "PushAutomationSend_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PushDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
