-- AlterEnum
ALTER TYPE "ContributionMethod" ADD VALUE 'ONLINE';

-- AlterTable
ALTER TABLE "Contribution" ADD COLUMN     "externalId" TEXT;

-- AlterTable
ALTER TABLE "Fund" ADD COLUMN     "onlineEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OnlineGivingConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "stripeSecretKey" TEXT,
    "stripeWebhookSecret" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlineGivingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnlineGivingConfig_organizationId_key" ON "OnlineGivingConfig"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Contribution_organizationId_externalId_key" ON "Contribution"("organizationId", "externalId");

-- AddForeignKey
ALTER TABLE "OnlineGivingConfig" ADD CONSTRAINT "OnlineGivingConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

