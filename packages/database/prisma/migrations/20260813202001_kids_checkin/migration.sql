-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "kioskId" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "method" TEXT NOT NULL DEFAULT 'STAFF',
ADD COLUMN     "securityCode" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "allowAppCheckIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CheckInKiosk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calendarId" TEXT,
    "publicKioskKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInKiosk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckInKiosk_publicKioskKey_key" ON "CheckInKiosk"("publicKioskKey");

-- CreateIndex
CREATE INDEX "CheckInKiosk_organizationId_idx" ON "CheckInKiosk"("organizationId");

-- AddForeignKey
ALTER TABLE "CheckInKiosk" ADD CONSTRAINT "CheckInKiosk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInKiosk" ADD CONSTRAINT "CheckInKiosk_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "EventCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "CheckInKiosk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

