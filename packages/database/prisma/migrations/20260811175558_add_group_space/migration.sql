-- CreateEnum
CREATE TYPE "GroupPostKind" AS ENUM ('MESSAGE', 'LINK', 'PRAYER');

-- CreateEnum
CREATE TYPE "GroupRsvpStatus" AS ENUM ('GOING', 'MAYBE', 'NO');

-- CreateTable
CREATE TABLE "GroupPost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "kind" "GroupPostKind" NOT NULL,
    "personId" TEXT,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPostPrayer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPostPrayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "createdByPersonId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupEventRsvp" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "groupEventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "GroupRsvpStatus" NOT NULL DEFAULT 'GOING',
    "attended" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupEventRsvp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPoll" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "createdByPersonId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPollVote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPollVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupPost_groupId_createdAt_idx" ON "GroupPost"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupPost_organizationId_idx" ON "GroupPost"("organizationId");

-- CreateIndex
CREATE INDEX "GroupPostPrayer_organizationId_idx" ON "GroupPostPrayer"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPostPrayer_postId_personId_key" ON "GroupPostPrayer"("postId", "personId");

-- CreateIndex
CREATE INDEX "GroupEvent_groupId_startAt_idx" ON "GroupEvent"("groupId", "startAt");

-- CreateIndex
CREATE INDEX "GroupEvent_organizationId_idx" ON "GroupEvent"("organizationId");

-- CreateIndex
CREATE INDEX "GroupEventRsvp_organizationId_idx" ON "GroupEventRsvp"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupEventRsvp_groupEventId_personId_key" ON "GroupEventRsvp"("groupEventId", "personId");

-- CreateIndex
CREATE INDEX "GroupPoll_groupId_createdAt_idx" ON "GroupPoll"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupPoll_organizationId_idx" ON "GroupPoll"("organizationId");

-- CreateIndex
CREATE INDEX "GroupPollVote_organizationId_idx" ON "GroupPollVote"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPollVote_pollId_personId_key" ON "GroupPollVote"("pollId", "personId");

-- AddForeignKey
ALTER TABLE "GroupPost" ADD CONSTRAINT "GroupPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPost" ADD CONSTRAINT "GroupPost_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPost" ADD CONSTRAINT "GroupPost_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPost" ADD CONSTRAINT "GroupPost_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostPrayer" ADD CONSTRAINT "GroupPostPrayer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostPrayer" ADD CONSTRAINT "GroupPostPrayer_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GroupPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostPrayer" ADD CONSTRAINT "GroupPostPrayer_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEvent" ADD CONSTRAINT "GroupEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEvent" ADD CONSTRAINT "GroupEvent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEventRsvp" ADD CONSTRAINT "GroupEventRsvp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEventRsvp" ADD CONSTRAINT "GroupEventRsvp_groupEventId_fkey" FOREIGN KEY ("groupEventId") REFERENCES "GroupEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEventRsvp" ADD CONSTRAINT "GroupEventRsvp_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPoll" ADD CONSTRAINT "GroupPoll_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPoll" ADD CONSTRAINT "GroupPoll_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPollVote" ADD CONSTRAINT "GroupPollVote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPollVote" ADD CONSTRAINT "GroupPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "GroupPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPollVote" ADD CONSTRAINT "GroupPollVote_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
