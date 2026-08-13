-- AlterTable
ALTER TABLE "Sermon" ADD COLUMN     "artworkUrl" TEXT,
ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "links" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "publicId" TEXT;

-- Backfill existing sermons with unguessable public ids, then lock the column.
UPDATE "Sermon" SET "publicId" = 'sp' || substr(md5(random()::text || id || clock_timestamp()::text), 1, 22) WHERE "publicId" IS NULL;
ALTER TABLE "Sermon" ALTER COLUMN "publicId" SET NOT NULL;

-- CreateTable
CREATE TABLE "SermonDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sermonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SermonDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SermonDocument_organizationId_idx" ON "SermonDocument"("organizationId");

-- CreateIndex
CREATE INDEX "SermonDocument_sermonId_idx" ON "SermonDocument"("sermonId");

-- CreateIndex
CREATE UNIQUE INDEX "Sermon_publicId_key" ON "Sermon"("publicId");

-- AddForeignKey
ALTER TABLE "SermonDocument" ADD CONSTRAINT "SermonDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SermonDocument" ADD CONSTRAINT "SermonDocument_sermonId_fkey" FOREIGN KEY ("sermonId") REFERENCES "Sermon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

