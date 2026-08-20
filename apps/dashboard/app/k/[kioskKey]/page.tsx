import { notFound } from "next/navigation";
import { eventService, expandOccurrences, kioskService, dayRangeInTimeZone, formatTimeShort, DEFAULT_TIMEZONE } from "@cms/database";
import { KioskScreen } from "../../../components/kiosk/KioskScreen";

export const dynamic = "force-dynamic";

/**
 * Public kids check-in kiosk (docs/domain/app.md "Check-in"): resolved by
 * unguessable key, pinned to one calendar — today's events appear
 * automatically. No person data renders until an exact household lookup.
 */
export default async function KioskPage({
  params,
  searchParams,
}: {
  params: Promise<{ kioskKey: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const [{ kioskKey }, { autoprint }] = await Promise.all([params, searchParams]);
  const kiosk = await kioskService.resolveKiosk(kioskKey);
  if (!kiosk) notFound();

  const events = await eventService.listEvents(kiosk.organizationId, {
    calendarId: kiosk.calendarId ?? undefined,
  });
  // "Today" is the church's calendar day, not the server's (UX audit #1).
  const timeZone = kiosk.organization.timezone ?? DEFAULT_TIMEZONE;
  const { start: dayStart, end: dayEnd } = dayRangeInTimeZone(timeZone);
  const today = events
    .flatMap((event) => expandOccurrences(event, dayStart, dayEnd, 4).map((occ) => ({ event, occ })))
    .sort((a, b) => a.occ.getTime() - b.occ.getTime())
    .map(({ event, occ }) => ({
      id: event.id,
      title: event.title,
      occurrenceAt: occ.toISOString(),
      timeLabel: formatTimeShort(occ, timeZone),
    }));

  return (
    <KioskScreen
      kioskKey={kioskKey}
      kioskName={kiosk.name}
      organizationName={kiosk.organization.name}
      calendarName={kiosk.calendar?.name ?? null}
      events={today}
      autoPrint={autoprint === "1"}
    />
  );
}
