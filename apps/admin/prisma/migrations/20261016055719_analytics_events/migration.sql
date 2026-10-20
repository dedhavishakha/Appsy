-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" BIGSERIAL NOT NULL,
    "appProjectId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "props" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_appProjectId_occurredAt_idx" ON "AnalyticsEvent"("appProjectId", "occurredAt");

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_appProjectId_fkey" FOREIGN KEY ("appProjectId") REFERENCES "AppProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
