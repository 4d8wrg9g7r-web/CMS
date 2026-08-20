import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { eventService, expandOccurrences, organizationService } from "@cms/database";
import { Card } from "../../../components/ui/Card";
import { formatEventDate, recurrenceLabel } from "../../../lib/events-format";

/**
 * Public events calendar (BLUEPRINT §13 "publishing an Event should make it available to
 * authorized website/app surfaces without duplicate entry"). Resolved by the org's
 * publicSiteId -- the same unauthenticated bootstrapping boundary as the other public
 * surfaces. Shows the next 60 days of occurrences across every PUBLISHED event.
 */
export default async function PublicCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicSiteId: string }>;
  searchParams: Promise<{ calendar?: string }>;
}) {
  const { publicSiteId } = await params;
  const site = await organizationService.resolvePublicSite(publicSiteId);
  if (!site) notFound();

  const { calendar: calendarId } = await searchParams;
  const timeZone = await organizationService.getOrganizationTimezone(site.organizationId);
  const calendars = await eventService.listCalendars(site.organizationId);
  // Only calendars that actually have published events get a public chip.
  const allPublished = await eventService.listEvents(site.organizationId, { publishedOnly: true });
  const usedCalendarIds = new Set(allPublished.map((e) => e.calendarId).filter(Boolean));
  const publicCalendars = calendars.filter((c) => usedCalendarIds.has(c.id));
  const events = calendarId ? allPublished.filter((e) => e.calendarId === calendarId) : allPublished;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const occurrences = events
    .flatMap((event) =>
      expandOccurrences(event, now, windowEnd, 20).map((startAt) => ({ event, startAt })),
    )
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .slice(0, 50);

  return (
    <div className="min-h-screen bg-surface-muted">
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">{site.name}</h1>
        <p className="mb-4 flex items-center gap-1.5 text-sm text-ink-secondary">
          <CalendarDays size={15} className="text-ink-muted" /> Upcoming events
        </p>

        {publicCalendars.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center gap-1.5" data-section="public-calendar-filters">
            <Link
              href={`/c/${publicSiteId}`}
              className={`rounded-full px-3 py-1.5 text-sm ${!calendarId ? "bg-ink text-white" : "bg-surface text-ink-secondary hover:text-ink"}`}
            >
              All
            </Link>
            {publicCalendars.map((calendar) => (
              <Link
                key={calendar.id}
                href={`/c/${publicSiteId}?calendar=${calendar.id}`}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                  calendarId === calendar.id ? "bg-ink text-white" : "bg-surface text-ink-secondary hover:text-ink"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: calendar.color }} />
                {calendar.name}
              </Link>
            ))}
          </div>
        )}

        {occurrences.length === 0 ? (
          <Card padding="md">
            <p className="py-6 text-center text-sm text-ink-muted">No upcoming events — check back soon.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {occurrences.map(({ event, startAt }) => (
              <Link key={`${event.id}-${startAt.toISOString()}`} href={`/e/${event.publicId}`} className="block">
                <Card padding="sm" interactive>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{event.title}</p>
                      <p className="mt-0.5 text-sm text-ink-secondary">{formatEventDate(startAt, event.allDay, timeZone)}</p>
                      {event.location && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                          <MapPin size={12} /> {event.location}
                        </p>
                      )}
                    </div>
                    {event.recurrence !== "NONE" && (
                      <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink-secondary">
                        {recurrenceLabel(event.recurrence, event.recurrenceInterval)}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
