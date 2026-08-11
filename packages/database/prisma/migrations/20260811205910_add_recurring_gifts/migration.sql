-- CreateTable
CREATE TABLE "RecurringGift" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "personId" TEXT,
    "email" TEXT,
    "fundId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "interval" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "lastPaymentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringGift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringGift_organizationId_personId_idx" ON "RecurringGift"("organizationId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringGift_organizationId_subscriptionId_key" ON "RecurringGift"("organizationId", "subscriptionId");

-- AddForeignKey
ALTER TABLE "RecurringGift" ADD CONSTRAINT "RecurringGift_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringGift" ADD CONSTRAINT "RecurringGift_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringGift" ADD CONSTRAINT "RecurringGift_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

