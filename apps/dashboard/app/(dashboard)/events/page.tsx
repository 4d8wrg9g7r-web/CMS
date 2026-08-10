import Link from "next/link";
import { headers } from "next/headers";
import { CalendarDays, ExternalLink, Lock, Plus } from "lucide-react";
import { eventService, nextOccurrence } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { formatEventDate, recurrenceLabel } from "../../../lib/events-format";
import { canEvents } from "../../../lib/events-access";
import { getCurrentOrganization } from "../../../lib/session";

export default async function EventsPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [canView, canManage] = await Promise.all([
    canEvents(organization.id, "event.view"),
    canEvents(organization.id, "event.manage"),
  ]);

  if (!canView) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Events</h1>
        <Card padding="md" className="mt-6">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to Events"
            description="Ask an organization owner or admin if you need access."
          />
        </Card>
      </div>
    );
  }

  const events = await eventService.listEvents(organization.id);
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const calendarUrl = `${proto}://${host}/c/${organization.publicSiteId}`;
  const now = new Date();
  const rows = events
    .map((event) => ({ event, next: nextOccurrence(event, now) }))
    // Upcoming (has a next occurrence) first by soonest; ended series last by start.
    .sort((a, b) => {
      if (a.next && b.next) return a.next.getTime() - b.next.getTime();
      if (a.next) return -1;
      if (b.next) return 1;
      return b.event.startAt.getTime() - a.event.startAt.getTime();
    });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Events</h1>
          <p className="text-sm text-ink-secondary">
            One event record drives the calendar, the public page, and registrations.
          </p>
        </div>
        {canManage && (
          <Link href="/events/new" className={buttonClasses("primary", "md")}>
            <Plus size={16} /> New event
          </Link>
        )}
      </div>

      <Card padding="sm" className="mb-4">
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
          <CalendarDays size={15} className="text-ink-muted" />
          Public calendar (published events only):
          <a href={calendarUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-accent hover:underline">
            <ExternalLink size={13} /> {calendarUrl}
          </a>
        </p>
      </Card>

      {rows.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<CalendarDays size={22} />}
            title="No events yet"
            description="Create your first event, publish it, and share its public link."
            action={
              canManage ? (
                <Link href="/events/new" className={buttonClasses("primary", "sm")}>
                  <Plus size={15} /> New event
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3 font-medium">Event</th>
                  <th className="px-5 py-3 font-medium">Next occurrence</th>
                  <th className="px-5 py-3 font-medium">Repeats</th>
                  <th className="px-5 py-3 font-medium">Registered</th>
                  <th className="px-5 py-3 font-medium">Visibility</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ event, next }) => (
                  <tr key={event.id} className="border-b border-border/60 last:border-0 hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      <Link href={`/events/${event.id}`} className="font-medium text-ink hover:text-accent">
                        {event.title}
                      </Link>
                      {event.location && <span className="block text-xs text-ink-muted">{event.location}</span>}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {next ? formatEventDate(next, event.allDay) : <span className="text-ink-muted">Ended</span>}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {recurrenceLabel(event.recurrence, event.recurrenceInterval)}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {event._count.registrations}
                      {event.capacity ? ` / ${event.capacity}` : ""}
                    </td>
                    <td className="px-5 py-3">
                      {event.isPublished ? <Badge variant="success">Published</Badge> : <Badge>Draft</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
