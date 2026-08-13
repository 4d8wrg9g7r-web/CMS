-- CreateEnum
CREATE TYPE "LivestreamChatRoleKind" AS ENUM ('HOST', 'MODERATOR');

-- AlterTable
ALTER TABLE "ChurchApp" ADD COLUMN     "chatSlowModeSeconds" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LivestreamChatMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT,
    "displayName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivestreamChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivestreamChatRole" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "LivestreamChatRoleKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivestreamChatRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LivestreamChatMessage_organizationId_createdAt_idx" ON "LivestreamChatMessage"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LivestreamChatRole_organizationId_personId_key" ON "LivestreamChatRole"("organizationId", "personId");

-- AddForeignKey
ALTER TABLE "LivestreamChatMessage" ADD CONSTRAINT "LivestreamChatMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivestreamChatMessage" ADD CONSTRAINT "LivestreamChatMessage_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivestreamChatRole" ADD CONSTRAINT "LivestreamChatRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivestreamChatRole" ADD CONSTRAINT "LivestreamChatRole_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

