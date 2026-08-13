import { notFound } from "next/navigation";
import { eventService, expandOccurrences, kioskService } from "@cms/database";
import { KioskScreen } from "../../../components/kiosk/KioskScreen";

export const dynamic = "force-dynamic";

/**
 * Public kids check-in kiosk (docs/domain/app.md "Check-in"): resolved by
 * unguessable key, pinned to one calendar — today's events appear
 * automatically. No person data renders until an exact household lookup.
 */
export default async function KioskPage({ params }: { params: Promise<{ kioskKey: string }> }) {
  const { kioskKey } = await params;
  const kiosk = await kioskService.resolveKiosk(kioskKey);
  if (!kiosk) notFound();

  const events = await eventService.listEvents(kiosk.organizationId, {
    calendarId: kiosk.calendarId ?? undefined,
  });
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const today = events
    .flatMap((event) => expandOccurrences(event, dayStart, dayEnd, 4).map((occ) => ({ event, occ })))
    .sort((a, b) => a.occ.getTime() - b.occ.getTime())
    .map(({ event, occ }) => ({
      id: event.id,
      title: event.title,
      occurrenceAt: occ.toISOString(),
      timeLabel: occ.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    }));

  return (
    <KioskScreen
      kioskKey={kioskKey}
      kioskName={kiosk.name}
      organizationName={kiosk.organization.name}
      calendarName={kiosk.calendar?.name ?? null}
      events={today}
    />
  );
}
