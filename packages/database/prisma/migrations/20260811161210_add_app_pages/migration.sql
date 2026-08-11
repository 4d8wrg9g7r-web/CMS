-- CreateTable
CREATE TABLE "AppPage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppPage_organizationId_idx" ON "AppPage"("organizationId");

-- AddForeignKey
ALTER TABLE "AppPage" ADD CONSTRAINT "AppPage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
