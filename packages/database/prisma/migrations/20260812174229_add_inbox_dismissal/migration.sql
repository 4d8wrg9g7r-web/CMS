-- CreateTable
CREATE TABLE "InboxDismissal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "dismissedByUserId" TEXT,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboxDismissal_organizationId_itemKey_key" ON "InboxDismissal"("organizationId", "itemKey");

-- AddForeignKey
ALTER TABLE "InboxDismissal" ADD CONSTRAINT "InboxDismissal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

