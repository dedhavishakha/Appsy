-- CreateEnum
CREATE TYPE "ChannelState" AS ENUM ('pending', 'connected', 'disconnected');

-- CreateEnum
CREATE TYPE "AppStatus" AS ENUM ('setup', 'building', 'live');

-- CreateEnum
CREATE TYPE "ConfigStatus" AS ENUM ('draft', 'scheduled', 'published', 'archived');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('image', 'video', 'icon', 'splash', 'screenshot', 'featureGraphic');

-- CreateTable
CREATE TABLE "Shop" (
    "id" UUID NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopGid" TEXT NOT NULL,
    "storefrontTokenGid" TEXT,
    "storefrontToken" TEXT,
    "channelState" "ChannelState" NOT NULL DEFAULT 'pending',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppProject" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "appName" VARCHAR(30) NOT NULL,
    "status" "AppStatus" NOT NULL DEFAULT 'setup',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigVersion" (
    "id" UUID NOT NULL,
    "appProjectId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "ConfigStatus" NOT NULL DEFAULT 'draft',
    "json" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "minRuntime" TEXT,
    "cdnKey" TEXT,
    "createdBy" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "appProjectId" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopGid_key" ON "Shop"("shopGid");

-- CreateIndex
CREATE UNIQUE INDEX "AppProject_shopId_key" ON "AppProject"("shopId");

-- CreateIndex
CREATE INDEX "ConfigVersion_appProjectId_status_idx" ON "ConfigVersion"("appProjectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigVersion_appProjectId_number_key" ON "ConfigVersion"("appProjectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");

-- CreateIndex
CREATE INDEX "Asset_appProjectId_idx" ON "Asset"("appProjectId");

-- AddForeignKey
ALTER TABLE "AppProject" ADD CONSTRAINT "AppProject_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigVersion" ADD CONSTRAINT "ConfigVersion_appProjectId_fkey" FOREIGN KEY ("appProjectId") REFERENCES "AppProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_appProjectId_fkey" FOREIGN KEY ("appProjectId") REFERENCES "AppProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
