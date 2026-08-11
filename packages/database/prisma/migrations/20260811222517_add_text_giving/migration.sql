-- AlterTable
ALTER TABLE "OnlineGivingConfig" ADD COLUMN     "textGivingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twilioAuthToken" TEXT;

