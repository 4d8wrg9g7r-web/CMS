-- CreateEnum
CREATE TYPE "AppPostKind" AS ENUM ('CHURCH', 'MEMBER');

-- CreateTable
CREATE TABLE "AppPost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "AppPostKind" NOT NULL,
    "personId" TEXT,
    "groupId" TEXT,
    "body" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppPostLike" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppPostLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppPostComment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppPostComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppLoginCode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppPost_organizationId_createdAt_idx" ON "AppPost"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AppPost_groupId_idx" ON "AppPost"("groupId");

-- CreateIndex
CREATE INDEX "AppPostLike_organizationId_idx" ON "AppPostLike"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AppPostLike_postId_personId_key" ON "AppPostLike"("postId", "personId");

-- CreateIndex
CREATE INDEX "AppPostComment_postId_createdAt_idx" ON "AppPostComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "AppPostComment_organizationId_idx" ON "AppPostComment"("organizationId");

-- CreateIndex
CREATE INDEX "AppLoginCode_organizationId_personId_idx" ON "AppLoginCode"("organizationId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSession_tokenHash_key" ON "AppSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AppSession_organizationId_personId_idx" ON "AppSession"("organizationId", "personId");

-- AddForeignKey
ALTER TABLE "AppPost" ADD CONSTRAINT "AppPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPost" ADD CONSTRAINT "AppPost_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPost" ADD CONSTRAINT "AppPost_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPostLike" ADD CONSTRAINT "AppPostLike_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPostLike" ADD CONSTRAINT "AppPostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "AppPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPostLike" ADD CONSTRAINT "AppPostLike_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPostComment" ADD CONSTRAINT "AppPostComment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPostComment" ADD CONSTRAINT "AppPostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "AppPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPostComment" ADD CONSTRAINT "AppPostComment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppLoginCode" ADD CONSTRAINT "AppLoginCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppLoginCode" ADD CONSTRAINT "AppLoginCode_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
