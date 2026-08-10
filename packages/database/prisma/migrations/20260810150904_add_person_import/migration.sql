-- CreateTable
CREATE TABLE "PersonImport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fileName" TEXT,
    "totalRows" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonImport_organizationId_createdAt_idx" ON "PersonImport"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "PersonImport" ADD CONSTRAINT "PersonImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonImport" ADD CONSTRAINT "PersonImport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
