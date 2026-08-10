-- CreateEnum
CREATE TYPE "PersonFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PersonRelationshipType" ADD VALUE 'GRANDPARENT';
ALTER TYPE "PersonRelationshipType" ADD VALUE 'GRANDCHILD';
ALTER TYPE "PersonRelationshipType" ADD VALUE 'FOSTER_PARENT';
ALTER TYPE "PersonRelationshipType" ADD VALUE 'FOSTER_CHILD';
ALTER TYPE "PersonRelationshipType" ADD VALUE 'WARD';

-- CreateTable
CREATE TABLE "PersonFieldDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "PersonFieldType" NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonFieldValue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonFieldDefinition_organizationId_idx" ON "PersonFieldDefinition"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonFieldDefinition_organizationId_key_key" ON "PersonFieldDefinition"("organizationId", "key");

-- CreateIndex
CREATE INDEX "PersonFieldValue_organizationId_idx" ON "PersonFieldValue"("organizationId");

-- CreateIndex
CREATE INDEX "PersonFieldValue_fieldId_idx" ON "PersonFieldValue"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonFieldValue_personId_fieldId_key" ON "PersonFieldValue"("personId", "fieldId");

-- AddForeignKey
ALTER TABLE "PersonFieldDefinition" ADD CONSTRAINT "PersonFieldDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonFieldValue" ADD CONSTRAINT "PersonFieldValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonFieldValue" ADD CONSTRAINT "PersonFieldValue_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonFieldValue" ADD CONSTRAINT "PersonFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "PersonFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
