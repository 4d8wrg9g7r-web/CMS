-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "blastId" TEXT;

-- CreateTable
CREATE TABLE "EmailBlast" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "suppressedCount" INTEGER NOT NULL DEFAULT 0,
    "noEmailCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailBlast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailBlastAttachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "blastId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailBlastAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailBlast_organizationId_createdAt_idx" ON "EmailBlast"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailBlastAttachment_organizationId_idx" ON "EmailBlastAttachment"("organizationId");

-- CreateIndex
CREATE INDEX "EmailBlastAttachment_blastId_idx" ON "EmailBlastAttachment"("blastId");

-- CreateIndex
CREATE INDEX "Message_blastId_idx" ON "Message"("blastId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_blastId_fkey" FOREIGN KEY ("blastId") REFERENCES "EmailBlast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailBlast" ADD CONSTRAINT "EmailBlast_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailBlast" ADD CONSTRAINT "EmailBlast_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailBlastAttachment" ADD CONSTRAINT "EmailBlastAttachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailBlastAttachment" ADD CONSTRAINT "EmailBlastAttachment_blastId_fkey" FOREIGN KEY ("blastId") REFERENCES "EmailBlast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
