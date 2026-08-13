-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "calendarId" TEXT,
ADD COLUMN     "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "EventCalendar" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2566e8',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventCalendar_organizationId_idx" ON "EventCalendar"("organizationId");

-- CreateIndex
CREATE INDEX "Event_calendarId_idx" ON "Event"("calendarId");

-- AddForeignKey
ALTER TABLE "EventCalendar" ADD CONSTRAINT "EventCalendar_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "EventCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

