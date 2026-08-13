-- CreateTable
CREATE TABLE "LivestreamConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cfAccountId" TEXT NOT NULL,
    "cfApiToken" TEXT NOT NULL,
    "liveInputId" TEXT,
    "rtmpsUrl" TEXT,
    "rtmpsStreamKey" TEXT,
    "srtUrl" TEXT,
    "srtStreamId" TEXT,
    "srtPassphrase" TEXT,
    "playbackEmbedUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LivestreamConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LivestreamConfig_organizationId_key" ON "LivestreamConfig"("organizationId");

-- AddForeignKey
ALTER TABLE "LivestreamConfig" ADD CONSTRAINT "LivestreamConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

