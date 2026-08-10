-- CreateEnum
CREATE TYPE "ContributionMethod" AS ENUM ('CASH', 'CHECK', 'CARD', 'ACH', 'OTHER');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "taxDeductible" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "batchDate" TIMESTAMP(3) NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'OPEN',
    "expectedCents" INTEGER,
    "closedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contribution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT,
    "donorName" TEXT,
    "fundId" TEXT NOT NULL,
    "batchId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "method" "ContributionMethod" NOT NULL,
    "checkNumber" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fund_organizationId_idx" ON "Fund"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Fund_organizationId_name_key" ON "Fund"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ContributionBatch_organizationId_batchDate_idx" ON "ContributionBatch"("organizationId", "batchDate");

-- CreateIndex
CREATE INDEX "Contribution_organizationId_receivedAt_idx" ON "Contribution"("organizationId", "receivedAt");

-- CreateIndex
CREATE INDEX "Contribution_personId_idx" ON "Contribution"("personId");

-- CreateIndex
CREATE INDEX "Contribution_fundId_idx" ON "Contribution"("fundId");

-- CreateIndex
CREATE INDEX "Contribution_batchId_idx" ON "Contribution"("batchId");

-- AddForeignKey
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionBatch" ADD CONSTRAINT "ContributionBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionBatch" ADD CONSTRAINT "ContributionBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ContributionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
