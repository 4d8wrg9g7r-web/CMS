-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HouseholdRole" ADD VALUE 'HEAD_OF_HOUSEHOLD';
ALTER TYPE "HouseholdRole" ADD VALUE 'FATHER';
ALTER TYPE "HouseholdRole" ADD VALUE 'MOTHER';
ALTER TYPE "HouseholdRole" ADD VALUE 'GRANDPARENT';

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "gender" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "suffix" TEXT;

