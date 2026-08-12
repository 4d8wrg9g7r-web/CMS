import Link from "next/link";
import { headers } from "next/headers";
import { CalendarDays, ExternalLink, Lock, MapPin, Plus } from "lucide-react";
import { campusService, eventService, nextOccurrence } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Select } from "../../../components/ui/Input";
import { PageHeader } from "../../../components/ui/PageHeader";
import { recurrenceLabel } from "../../../lib/events-format";
import { canEvents } from "../../../lib/events-access";
import { getCurrentOrganization } from "../../../lib/session";

/**
 * Events (docs/design-system.md): closer to a calendar product than a table.
 * Upcoming and Past views; upcoming rows lead with a big date chip, time,
 * location, and registration fill. One event record still drives the
 * calendar, the public page, and registrations.
 */

const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ campus?: string; view?: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [canView, canManage] = await Promise.all([
    canEvents(organization.id, "event.view"),
    canEvents(organization.id, "event.manage"),
  ]);

  if (!canView) {
    return (
      <div>
        <PageHeader title="Events" />
        <Card padding="md">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to Events"
            description="Ask an organization owner or admin if you need access."
          />
        </Card>
      </div>
    );
  }

  const params = await searchParams;
  const campusId = params.campus || undefined;
  const view = params.view === "past" ? "past" : "upcoming";
  const campuses = await campusService.listCampuses(organization.id);
  const events = await eventService.listEvents(organization.id, { campusId });
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const calendarUrl = `${proto}://${host}/c/${organization.publicSiteId}`;
  const now = new Date();

  const withNext = events.map((event) => ({ event, next: nextOccurrence(event, now) }));
  const upcoming = withNext
    .filter((e): e is { event: (typeof events)[number]; next: Date } => e.next !== null)
    .sort((a, b) => a.next.getTime() - b.next.getTime());
  const past = withNext.filter((e) => e.next === null).sort((a, b) => b.event.startAt.getTime() - a.event.startAt.getTime());

  const rows = view === "past" ? past : upcoming;

  const viewHref = (v: string) => {
    const sp = new URLSearchParams();
    if (v === "past") sp.set("view", "past");
    if (campusId) sp.set("campus", campusId);
    const query = sp.toString();
    return query ? `/events?${query}` : "/events";
  };

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle={`${upcoming.length} upcoming at ${organization.name}`}
        actions={
          canManage ? (
            <Link href="/events/new" className={buttonClasses("primary", "sm")}>
              <Plus size={15} /> New event
            </Link>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" role="tablist" aria-label="Event views">
          {[
            { key: "upcoming", label: "Upcoming" },
            { key: "past", label: "Past" },
          ].map((v) => (
            <Link
              key={v.key}
              href={viewHref(v.key)}
              role="tab"
              aria-selected={view === v.key}
              className={`rounded-md px-3.5 py-1.5 text-sm transition-colors duration-180 ${
                view === v.key
                  ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                  : "font-medium text-ink-secondary hover:bg-black/[0.04] hover:text-ink"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>

        {campuses.length > 0 && (
          <form method="get">
            {view === "past" && <input type="hidden" name="view" value="past" />}
            <Select name="campus" defaultValue={campusId ?? ""} className="w-44 py-2 text-sm" aria-label="Campus">
              <option value="">All campuses</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </Select>
          </form>
        )}

        <a
          href={calendarUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-dark"
          title="Published events appear on your public calendar"
        >
          <ExternalLink size={14} /> Public calendar
        </a>
      </div>

      {rows.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<CalendarDays size={22} />}
            title={view === "past" ? "No past events" : campusId ? "No events match this campus" : "Plan your first event"}
            description={
              view === "past"
                ? "Finished events and ended series will collect here."
                : campusId
                  ? "Try a different campus filter."
                  : "One event record drives the calendar, the public registration page, and check-in."
            }
            action={
              canManage && !campusId && view === "upcoming" ? (
                <Link href="/events/new" className={buttonClasses("primary", "sm")}>
                  <Plus size={15} /> New event
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card padding="none" data-section="events-list">
          <ul className="divide-y divide-border">
            {rows.map(({ event, next }) => {
              const when = next ?? event.startAt;
              const nearFull = event.capacity && event._count.registrations >= event.capacity * 0.8;
              return (
                <li key={event.id}>
                  <Link
                    href={`/events/${event.id}`}
                    className="flex min-h-[76px] items-center gap-5 px-5 py-3.5 transition-colors duration-180 hover:bg-surface-muted"
                  >
                    <div className="w-12 shrink-0 text-center">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-accent">{MONTH[when.getMonth()]}</p>
                      <p className="text-metric text-2xl leading-tight text-ink">{when.getDate()}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink">{event.title}</p>
                      <p className="truncate text-sm text-ink-muted">
                        {event.allDay
                          ? "All day"
                          : when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        {event.recurrence !== "NONE" && ` · ${recurrenceLabel(event.recurrence, event.recurrenceInterval)}`}
                        {event.location && (
                          <span className="inline-flex items-center gap-1">
                            {" · "}
                            <MapPin size={12} className="inline" /> {event.location}
                          </span>
                        )}
                      </p>
                    </div>
                    {event._count.registrations > 0 && (
                      <span className={`shrink-0 text-sm ${nearFull ? "font-medium text-warning" : "text-ink-secondary"}`}>
                        {event._count.registrations}
                        {event.capacity ? ` / ${event.capacity}` : ""} registered
                      </span>
                    )}
                    {event.isPublished ? <Badge variant="success">Published</Badge> : <Badge>Draft</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
