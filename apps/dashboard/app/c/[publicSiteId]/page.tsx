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
export default async function PublicCalendarPage({ params }: { params: Promise<{ publicSiteId: string }> }) {
  const { publicSiteId } = await params;
  const site = await organizationService.resolvePublicSite(publicSiteId);
  if (!site) notFound();

  const events = await eventService.listEvents(site.organizationId, { publishedOnly: true });
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
        <p className="mb-8 flex items-center gap-1.5 text-sm text-ink-secondary">
          <CalendarDays size={15} className="text-ink-muted" /> Upcoming events
        </p>

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
                      <p className="mt-0.5 text-sm text-ink-secondary">{formatEventDate(startAt, event.allDay)}</p>
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
