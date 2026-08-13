-- AlterTable
ALTER TABLE "Sermon" ADD COLUMN     "videoFileUrl" TEXT;

-- CreateTable
CREATE TABLE "MediaJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sermonId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceUrl" TEXT NOT NULL,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaJob_status_createdAt_idx" ON "MediaJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MediaJob_organizationId_idx" ON "MediaJob"("organizationId");

-- AddForeignKey
ALTER TABLE "MediaJob" ADD CONSTRAINT "MediaJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

