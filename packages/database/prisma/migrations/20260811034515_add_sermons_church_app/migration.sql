-- CreateTable
CREATE TABLE "Sermon" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "speaker" TEXT,
    "series" TEXT,
    "passage" TEXT,
    "description" TEXT,
    "videoUrl" TEXT,
    "preachedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sermon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchApp" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "publicAppId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchApp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sermon_organizationId_preachedAt_idx" ON "Sermon"("organizationId", "preachedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchApp_organizationId_key" ON "ChurchApp"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchApp_publicAppId_key" ON "ChurchApp"("publicAppId");

-- AddForeignKey
ALTER TABLE "Sermon" ADD CONSTRAINT "Sermon_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchApp" ADD CONSTRAINT "ChurchApp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
