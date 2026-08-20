import Link from "next/link";
import { headers } from "next/headers";
import { CalendarDays, ExternalLink, Lock, MapPin, Plus } from "lucide-react";
import { campusService, eventService, mediaService, nextOccurrence, formatInTimeZone, formatTimeShort, DEFAULT_TIMEZONE } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { GraphicsLibraryCard } from "../../../components/GraphicsLibraryCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input, Select } from "../../../components/ui/Input";
import { ActionForm, FieldError } from "../../../components/ui/ActionForm";
import { SubmitButton } from "../../../components/ui/SubmitButton";
import { PageHeader } from "../../../components/ui/PageHeader";
import { recurrenceLabel } from "../../../lib/events-format";
import { canEvents } from "../../../lib/events-access";
import { archiveCalendarAction, createCalendarAction } from "./actions";
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
  searchParams: Promise<{ campus?: string; view?: string; calendar?: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  const timeZone = organization?.timezone ?? DEFAULT_TIMEZONE;

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
  const calendarId = params.calendar || undefined;
  const view = params.view === "past" ? "past" : "upcoming";
  const campuses = await campusService.listCampuses(organization.id);
  const calendars = await eventService.listCalendars(organization.id);
  const graphics = await mediaService.listMediaAssets(organization.id, { collection: "event" });
  const events = await eventService.listEvents(organization.id, { campusId, calendarId });
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
    if (calendarId) sp.set("calendar", calendarId);
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

        {calendars.length > 0 && (
          <div className="flex items-center gap-1" role="tablist" aria-label="Calendars" data-section="calendar-filters">
            {[{ id: "", name: "All calendars", color: "" }, ...calendars].map((calendar) => {
              const sp = new URLSearchParams();
              if (view === "past") sp.set("view", "past");
              if (campusId) sp.set("campus", campusId);
              if (calendar.id) sp.set("calendar", calendar.id);
              const active = (calendarId ?? "") === calendar.id;
              return (
                <Link
                  key={calendar.id || "all"}
                  href={sp.toString() ? `/events?${sp.toString()}` : "/events"}
                  role="tab"
                  aria-selected={active}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors duration-180 ${
                    active
                      ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                      : "font-medium text-ink-secondary hover:bg-black/[0.04] hover:text-ink"
                  }`}
                >
                  {calendar.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: calendar.color }} />}
                  {calendar.name}
                </Link>
              );
            })}
          </div>
        )}

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
                      <p className="text-[11px] font-bold uppercase tracking-wide text-accent">{formatInTimeZone(when, timeZone, { month: "short" }).toUpperCase()}</p>
                      <p className="text-metric text-2xl leading-tight text-ink">{formatInTimeZone(when, timeZone, { day: "numeric" })}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink">{event.title}</p>
                      <p className="truncate text-sm text-ink-muted">
                        {event.allDay
                          ? "All day"
                          : formatTimeShort(when, timeZone)}
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
                    {event.calendar && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-secondary"
                        data-calendar-chip
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: event.calendar.color }} />
                        {event.calendar.name}
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

      {canManage && (
        <Card padding="md" className="mt-6 max-w-2xl" data-section="manage-calendars">
          <h2 className="mb-1 text-sm font-semibold text-ink">Calendars</h2>
          <p className="mb-3 text-xs text-ink-muted">
            Group events into ministry calendars — Youth, Worship, Kids — filterable here and on your public calendar.
          </p>
          {calendars.length > 0 && (
            <ul className="mb-3 divide-y divide-border text-sm">
              {calendars.map((calendar) => (
                <li key={calendar.id} className="flex items-center justify-between gap-2 py-2" data-calendar-row={calendar.id}>
                  <span className="inline-flex items-center gap-2 font-medium text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: calendar.color }} />
                    {calendar.name}
                    <span className="font-normal text-ink-muted">
                      · {calendar._count.events} {calendar._count.events === 1 ? "event" : "events"}
                    </span>
                  </span>
                  <form action={archiveCalendarAction.bind(null, calendar.id)}>
                    <button type="submit" className="text-xs text-ink-muted hover:text-danger">
                      Archive
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={createCalendarAction} resetOnSuccess className="flex flex-wrap items-start gap-2">
            <span className="flex flex-col">
              <Input name="name" placeholder="Youth Ministry" maxLength={80} className="w-56" aria-label="Calendar name" />
              <FieldError name="name" />
            </span>
            <input
              type="color"
              name="color"
              defaultValue="#2566e8"
              className="h-9 w-11 cursor-pointer rounded-sm border border-border-strong bg-surface"
              aria-label="Calendar color"
            />
            <SubmitButton variant="secondary" size="sm" pendingLabel="Adding…" data-action="create-calendar">
              <Plus size={14} /> Add calendar
            </SubmitButton>
          </ActionForm>
        </Card>
      )}

      <div className="mt-6">
        <GraphicsLibraryCard
          collection="event"
          title="Event graphics"
          blurb="Artwork for events — attach to an event from its Settings tab. Separate from sermon graphics."
          assets={graphics.map((g) => ({ id: g.id, name: g.name, url: g.url }))}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
