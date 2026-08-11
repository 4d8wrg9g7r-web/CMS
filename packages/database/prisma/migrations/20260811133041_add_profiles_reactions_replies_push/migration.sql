-- AlterTable
ALTER TABLE "AppPostComment" ADD COLUMN     "parentCommentId" TEXT;

-- AlterTable
ALTER TABLE "AppPostLike" ADD COLUMN     "emoji" TEXT NOT NULL DEFAULT '❤️';

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "photoUrl" TEXT;

-- CreateTable
CREATE TABLE "AppPushSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppPushSubscription_endpoint_key" ON "AppPushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "AppPushSubscription_organizationId_personId_idx" ON "AppPushSubscription"("organizationId", "personId");

-- AddForeignKey
ALTER TABLE "AppPostComment" ADD CONSTRAINT "AppPostComment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "AppPostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPushSubscription" ADD CONSTRAINT "AppPushSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPushSubscription" ADD CONSTRAINT "AppPushSubscription_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
