-- CreateTable
CREATE TABLE "AccountDeletion" (
    "id" UUID NOT NULL,
    "appProjectId" UUID NOT NULL,
    "customerId" TEXT NOT NULL,
    "installId" UUID,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountDeletion_appProjectId_customerId_idx" ON "AccountDeletion"("appProjectId", "customerId");

-- CreateIndex
CREATE INDEX "AccountDeletion_requestedAt_idx" ON "AccountDeletion"("requestedAt");

-- AddForeignKey
ALTER TABLE "AccountDeletion" ADD CONSTRAINT "AccountDeletion_appProjectId_fkey" FOREIGN KEY ("appProjectId") REFERENCES "AppProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

